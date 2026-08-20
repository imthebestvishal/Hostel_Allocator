const DEFAULT_TOUR_URL =
    "https://tour.panoee.net/iframe/hostel-tour-26?embedFullscreen=1&embedVr=1&embedGyro=1";



const ROOM_TOURS = {};


/*
    Automatically create virtual tour entries
    for all 280 rooms.

    Boys Hostel:
    7 floors × 20 rooms = 140

    Girls Hostel:
    7 floors × 20 rooms = 140
*/

["Boys", "Girls"].forEach(hostel => {

    for (let floor = 1; floor <= 7; floor++) {

        for (let room = 1; room <= 20; room++) {

            const roomId =
                `${hostel}-${floor}-${room}`;

            ROOM_TOURS[roomId] =
                DEFAULT_TOUR_URL;
        }
    }

});

(() => {

    /* =========================================================
       CONFIGURATION
       ========================================================= */

    const CONFIG = {

        mapUrl: 'assets/hostel/floorplan.svg',

        // 10 rooms per floor
        roomIds: Array.from(
            { length: 20 },
            (_, i) => String(i + 1).padStart(2, '0')
        ),

        hostels: {

            boys: {
                name: 'Boys Hostel',
                prefix: 'B'
            },

            girls: {
                name: 'Girls Hostel',
                prefix: 'G'
            }

        },

        floors: [

            {
                value: 0,
                label: 'Ground Floor'
            },

            {
                value: 1,
                label: '1st Floor'
            },

            {
                value: 2,
                label: '2nd Floor'
            },

            {
                value: 3,
                label: '3rd Floor'
            },

            {
                value: 4,
                label: '4th Floor'
            },

            {
                value: 5,
                label: '5th Floor'
            },

            {
                value: 6,
                label: '6th Floor'
            }

        ],

        // SAME TOUR FOR ALL 140 ROOMS FOR NOW
        defaultTourUrl:
            'https://tour.panoee.net/iframe/hostel-tour-26?embedFullscreen=1&embedVr=1&embedGyro=1',

        weights: {
            year: 0.40,
            region: 0.30,
            hobbies: 0.30
        }

    };


    /* =========================================================
       CURRENT HOSTEL / FLOOR
       ========================================================= */

    let selectedHostel = 'boys';

    let selectedFloor = 0;

    let roomsCache = [];

    let allocationsCache = [];

    let studentsCache = [];

    let tooltipPinned = false;

    let hideTimer = null;


    /* =========================================================
       HELPERS
       ========================================================= */

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    const $$ = (selector, root = document) =>
        Array.from(root.querySelectorAll(selector));


    function escapeHTML(value) {

        return String(value ?? '').replace(
            /[&<>"']/g,
            char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char])
        );

    }


    function normalize(value) {

        return String(value ?? '')
            .trim()
            .toLowerCase();

    }


    function parseHobbies(value) {

        return new Set(

            String(value ?? '')
                .split(/[,;|]/)
                .map(h => normalize(h))
                .filter(Boolean)

        );

    }


    /* =========================================================
       COMPATIBILITY
       ========================================================= */

    function hobbyScore(a, b) {

        const A = parseHobbies(a);

        const B = parseHobbies(b);

        if (!A.size || !B.size) {
            return 0;
        }

        let common = 0;

        A.forEach(hobby => {

            if (B.has(hobby)) {
                common++;
            }

        });

        const union =
            new Set([...A, ...B]).size;

        return union
            ? (common / union) * 100
            : 0;

    }


    function yearScore(a, b) {

        const A = normalize(a);

        const B = normalize(b);

        if (!A || !B) {
            return 0;
        }

        if (A === B) {
            return 100;
        }

        const yearA =
            parseInt(A, 10);

        const yearB =
            parseInt(B, 10);

        if (
            !Number.isNaN(yearA) &&
            !Number.isNaN(yearB) &&
            Math.abs(yearA - yearB) === 1
        ) {

            return 50;

        }

        return 0;

    }


    function getRegion(student) {

        return (

            student?.State ||
            student?.state ||
            student?.Region ||
            student?.region ||
            student?.Category ||
            student?.category ||
            ''

        );

    }


    function compatibility(me, other) {

        const year = yearScore(

            me?.Year || me?.year,

            other?.Year || other?.year

        );


        const myRegion =
            normalize(getRegion(me));

        const otherRegion =
            normalize(getRegion(other));


        const region =

            myRegion &&
            myRegion === otherRegion

                ? 100

                : 0;


        const hobbies = hobbyScore(

            me?.Hobbies || me?.hobbies,

            other?.Hobbies || other?.hobbies

        );


        const total =

            year * CONFIG.weights.year +

            region * CONFIG.weights.region +

            hobbies * CONFIG.weights.hobbies;


        return {

            year,

            region,

            hobbies,

            total:
                Math.round(total * 10) / 10

        };

    }


    function getCurrentStudent() {

        const status =
            window.currentStudentStatus || {};

        return (

            status.applicationDetails ||

            status.student ||

            status

        );

    }


    /* =========================================================
       HOSTEL / FLOOR HELPERS
       ========================================================= */

    function getFloorLabel(floor) {

        const found =
            CONFIG.floors.find(
                item => item.value === Number(floor)
            );

        return found
            ? found.label
            : 'Unknown Floor';

    }


    function getHostelName(hostel) {

        return CONFIG.hostels[hostel]?.name ||
            'Hostel';

    }


    /*
        Creates visible room numbers.

        Ground Floor:
        B-G-01
        B-G-02

        1st Floor:
        B-101
        B-102

        Girls:
        G-101
        G-102
    */

    function getDisplayRoomNumber(
        hostel,
        floor,
        roomId
    ) {

        const prefix =
            CONFIG.hostels[hostel]?.prefix ||
            'H';


        if (Number(floor) === 0) {

            return `${prefix}-G-${roomId}`;

        }


        return `${prefix}-${floor}${roomId}`;

    }


    /*
        Unique key for all 140 rooms.

        Example:

        boys-0-01
        boys-1-01
        girls-1-01

    */

    function getRoomInstanceKey(
        hostel,
        floor,
        roomId
    ) {

        return `${hostel}-${floor}-${roomId}`;

    }


    function roomKey(value) {

        const raw =
            String(value ?? '').trim();

        const match =
            raw.match(/(\d{1,2})$/);

        return match

            ? match[1].padStart(2, '0')

            : raw.padStart(2, '0');

    }


    /* =========================================================
       FIND ROOM FROM DATABASE
       ========================================================= */

    function getRoom(
        roomNumber,
        hostel,
        floor
    ) {

        const key =
            roomKey(roomNumber);


        const hostelName =
            getHostelName(hostel);


        return roomsCache.find(room => {

            const mapRoom =
                roomKey(

                    room.MapRoom ||

                    room.MapRoomNumber ||

                    room.mapRoom ||

                    room.RoomNumber ||

                    room.roomNumber ||

                    room.RoomID

                );


            const roomHostel =
                normalize(

                    room.Hostel ||

                    room.hostel ||

                    room.HostelName ||

                    ''

                );


            const roomFloor =
                String(

                    room.Floor ||

                    room.floor ||

                    ''

                ).trim();


            const hostelMatches =

                !roomHostel ||

                roomHostel === normalize(hostel) ||

                roomHostel === normalize(hostelName);


            const floorMatches =

                !roomFloor ||

                roomFloor === String(floor);


            return (

                mapRoom === key &&

                hostelMatches &&

                floorMatches

            );

        });

    }


    /* =========================================================
       ROOM MEMBERS
       ========================================================= */

    function getMembers(room) {

        const roomId =

            String(

                room?.RoomID ||

                room?.roomId ||

                ''

            ).trim();


        const roomNumber =
            roomKey(

                room?.MapRoom ||

                room?.RoomNumber ||

                room?.roomNumber ||

                ''

            );


        const allocations =
            allocationsCache.filter(allocation => {

                const allocationRoomId =

                    String(

                        allocation.RoomID ||

                        allocation.roomId ||

                        ''

                    ).trim();


                const allocationRoomNumber =
                    roomKey(

                        allocation.RoomNumber ||

                        allocation.roomNumber ||

                        ''

                    );


                const active =

                    !allocation.Status ||

                    [

                        'active',

                        'confirmed',

                        'allocated'

                    ].includes(
                        normalize(
                            allocation.Status
                        )
                    );


                return (

                    active &&

                    (

                        (

                            roomId &&

                            allocationRoomId === roomId

                        )

                        ||

                        (

                            roomNumber &&

                            allocationRoomNumber === roomNumber

                        )

                    )

                );

            });


        return allocations.map(allocation => {

            const enrollment =

                String(

                    allocation.EnrollmentNo ||

                    allocation.enrollmentNo ||

                    ''

                ).trim();


            return (

                studentsCache.find(student =>

                    String(

                        student.EnrollmentNo ||

                        student.enrollmentNo ||

                        ''

                    ).trim() === enrollment

                )

                ||

                allocation

            );

        });

    }


    /* =========================================================
       BUILD 10 ROOMS FOR CURRENT FLOOR
       ========================================================= */

    function buildRoomData() {

        const me =
            getCurrentStudent();


        return CONFIG.roomIds.map(id => {

            const room =
                getRoom(
                    id,
                    selectedHostel,
                    selectedFloor
                );


            const configured =
                Boolean(room);


            const safeRoom =

                room ||

                {

                    RoomNumber:
                        getDisplayRoomNumber(
                            selectedHostel,
                            selectedFloor,
                            id
                        ),

                    Capacity: 0,

                    Occupied: 0,

                    VacantBeds: 0,

                    Status:
                        'Not configured'

                };


            const capacity =
                Number(
                    safeRoom.Capacity
                ) || 0;


            const occupied =
                Number(
                    safeRoom.Occupied
                ) || 0;


            const vacant =
                Number(
                    safeRoom.VacantBeds
                );


            const seats =

                configured &&
                Number.isFinite(vacant)

                    ? Math.max(
                        0,
                        vacant
                    )

                    : configured

                        ? Math.max(
                            0,
                            capacity - occupied
                        )

                        : 0;


            const members =
                getMembers(
                    safeRoom
                );


            const scores =
                members.map(member =>

                    compatibility(
                        me,
                        member
                    ).total

                );


            const score =

                scores.length

                    ? Math.round(

                        (

                            scores.reduce(
                                (a, b) => a + b,
                                0
                            )

                            /

                            scores.length

                        ) * 10

                    ) / 10

                    : null;


            /*
                Each of the 140 room instances
                receives its own tour configuration.

                For now they all use the same URL.
            */

            const tourUrl =

                safeRoom.VirtualTour ||

                safeRoom.virtualTour ||

                CONFIG.defaultTourUrl;


            return {

                id,

                instanceKey:
                    getRoomInstanceKey(
                        selectedHostel,
                        selectedFloor,
                        id
                    ),

                displayNumber:
                    getDisplayRoomNumber(
                        selectedHostel,
                        selectedFloor,
                        id
                    ),

                hostel:
                    selectedHostel,

                hostelName:
                    getHostelName(
                        selectedHostel
                    ),

                floor:
                    selectedFloor,

                floorLabel:
                    getFloorLabel(
                        selectedFloor
                    ),

                room:
                    safeRoom,

                configured,

                capacity,

                occupied,

                seats,

                full:
                    seats <= 0,

                members,

                score,

                tourUrl

            };

        });

    }


    /* =========================================================
       VIRTUAL TOUR
       ========================================================= */

    

    // ==========================================
// VIRTUAL TOUR FUNCTION
// ==========================================

function loadVirtualTour(data) {

    const viewer =
        $('#virtualTourViewer');

    const roomTitle =
        $('#selectedTourRoom');

    const roomLocation =
        $('#selectedTourLocation');

    if (!viewer) {
        return;
    }

    const roomName =
        data.displayNumber || data.id;

    const hostelName =
        data.hostelName || 'Hostel';

    const floorName =
        data.floorLabel || 'Selected Floor';

    const tourUrl =
        data.tourUrl ||
        data.room?.VirtualTour ||
        data.room?.virtualTour ||
        'https://tour.panoee.net/iframe/hostel-tour-26?embedFullscreen=1&embedVr=1&embedGyro=1';

    roomTitle.textContent = roomName;

    roomLocation.textContent =
        `${hostelName} · ${floorName}`;

    viewer.innerHTML = '';

    const iframe =
        document.createElement('iframe');

    iframe.id =
        `tour-${data.instanceKey || data.id}`;

    iframe.title =
        `Virtual Tour - ${roomName}`;

    iframe.src = tourUrl;

    iframe.width = '100%';

    iframe.height = '100%';

    iframe.frameBorder = '0';

    iframe.scrolling = 'no';

    iframe.allow =
        'autoplay; accelerometer; gyroscope; fullscreen; xr-spatial-tracking';

    iframe.allowFullscreen = true;

    iframe.loading = 'eager';

    viewer.appendChild(iframe);
}


// ==========================================
// YOUR EXISTING TOOLTIP FUNCTION
// ==========================================



    /* =========================================================
       TOOLTIP
       ========================================================= */

    function renderTooltip(
        data,
        x,
        y,
        pinned = false
    ) {

        const tooltip =
            $('#roomTooltip');

        if (!tooltip) {
            return;
        }


        clearTimeout(
            hideTimer
        );


        const me =
            getCurrentStudent();


        const memberRows =
            data.members.length

                ? data.members.map(member => {

                    const name =

                        member.StudentName ||

                        member.Name ||

                        member.name ||

                        'Student';


                    const score =
                        compatibility(
                            me,
                            member
                        );


                    return `

                        <div class="room-tooltip-member">

                            <div>

                                <strong>

                                    ${escapeHTML(
                                        name
                                    )}

                                </strong>

                                <span>

                                    ${escapeHTML(

                                        member.EnrollmentNo ||

                                        ''

                                    )}

                                </span>

                            </div>

                            <b>

                                ${score.total}%

                            </b>

                        </div>

                    `;

                }).join('')

                : `

                    <div class="room-tooltip-empty">

                        No current roommates

                    </div>

                `;


        const compatibilityScore =

            data.score == null

                ? 'N/A'

                : `${data.score}%`;


        tooltip.innerHTML = `

            <div class="room-tooltip-head">

                <div>

                    <span>
                        ROOM
                    </span>

                    <strong>

                        ${escapeHTML(
                            data.displayNumber
                        )}

                    </strong>

                    <small class="room-location">

                        ${escapeHTML(
                            data.hostelName
                        )}

                        ·

                        ${escapeHTML(
                            data.floorLabel
                        )}

                    </small>

                </div>

                <span class="

                    room-status

                    ${

                        !data.configured ||
                        data.full

                            ? 'full'

                            : 'available'

                    }

                ">

                    ${

                        !data.configured

                            ? 'NOT CONFIGURED'

                            : data.full

                                ? 'FULL'

                                : `${data.seats}
                                   SEAT${data.seats === 1 ? '' : 'S'}
                                   LEFT`

                    }

                </span>

            </div>


            <div class="room-tooltip-score">

                <div>

                    <span>

                        Compatibility with you

                    </span>

                    <strong>

                        ${compatibilityScore}

                    </strong>

                </div>


                <div class="room-tooltip-bar">

                    <i style="

                        width:

                        ${

                            data.score == null

                                ? 0

                                : Math.min(
                                    100,
                                    data.score
                                )

                        }%;

                    "></i>

                </div>

            </div>


            <div class="room-tooltip-meta">

                <span>

                    Occupancy

                    <b>

                        ${

                            data.configured

                                ? `${data.occupied}/${data.capacity}`

                                : '—'

                        }

                    </b>

                </span>


                <span>

                    Availability

                    <b>

                        ${

                            data.configured

                                ? data.seats

                                : '—'

                        }

                    </b>

                </span>

            </div>


            <div class="room-tooltip-section">

                <span class="room-tooltip-label">

                    ROOMMATES

                </span>


                ${memberRows}

            </div>


            <button
                type="button"
                class="room-tour-button"
                data-room-tour="${escapeHTML(
                    data.instanceKey
                )}"
            >

                🌐 Explore Virtual Tour

            </button>


            <div class="room-tooltip-note">

                ${

                    data.configured

                        ? 'Year 40% · Region 30% · Hobbies 30%'

                        : 'Add Hostel, Floor and MapRoom to the Rooms sheet.'

                }

            </div>

        `;


        tooltip.classList.add(
            'visible'
        );


        tooltip.classList.toggle(
            'pinned',
            pinned
        );


        tooltipPinned =
            pinned;


        const tourButton =
            $('[data-room-tour]', tooltip);


        tourButton?.addEventListener(
            'click',
            event => {

                event.stopPropagation();

                loadVirtualTour(
                    data
                );

            }
        );


        const shell =
            $('#hostelMapShell');

        if (!shell) {
            return;
        }


        const shellRect =
            shell.getBoundingClientRect();


        const width =
            tooltip.offsetWidth || 290;


        const height =
            tooltip.offsetHeight || 300;


        let left =

            x -

            shellRect.left +

            18;


        let top =

            y -

            shellRect.top +

            18;


        if (

            left + width >

            shellRect.width - 10

        ) {

            left =

                x -

                shellRect.left -

                width -

                18;

        }


        if (

            top + height >

            shellRect.height - 10

        ) {

            top =

                shellRect.height -

                height -

                10;

        }


        tooltip.style.left =
            `${Math.max(10, left)}px`;


        tooltip.style.top =
            `${Math.max(10, top)}px`;

    }


    function scheduleHideTooltip() {

        if (tooltipPinned) {
            return;
        }


        clearTimeout(
            hideTimer
        );


        hideTimer =
            setTimeout(
                hideTooltip,
                250
            );

    }


    function hideTooltip() {

        clearTimeout(
            hideTimer
        );


        const tooltip =
            $('#roomTooltip');


        if (!tooltip) {
            return;
        }


        if (tooltipPinned) {
            return;
        }


        tooltip.classList.remove(
            'visible'
        );

    }


    function forceHideTooltip() {

        tooltipPinned = false;

        clearTimeout(
            hideTimer
        );


        $('#roomTooltip')
            ?.classList.remove(
                'visible',
                'pinned'
            );

    }


    /* =========================================================
       APPLY ROOM STATES
       ========================================================= */

    function applyRoomStates(data) {

        const svg =
            $('#hostelMapCanvas svg');

        if (!svg) {
            return;
        }


        const scores =

            data

                .filter(

                    room =>

                        room.configured &&

                        !room.full &&

                        room.score != null

                )

                .map(
                    room => room.score
                );


        const best =

            scores.length

                ? Math.max(...scores)

                : null;




        data.forEach(room => {

            const rect =
                svg.querySelector(
                    `#R${room.id}`
                );

            if (!rect) {
                return;
            }


            rect.style.display = '';


            rect.classList.remove(

                'room-available',

                'room-full',

                'room-best'

            );


            if (

                !room.configured ||

                room.full

            ) {

                rect.classList.add(
                    'room-full'
                );

            }

            else {

                rect.classList.add(
                    'room-available'
                );


                if (

                    best != null &&

                    room.score === best

                ) {

                    rect.classList.add(
                        'room-best'
                    );

                }

            }


            rect.setAttribute(
                'tabindex',
                '0'
            );


            rect.setAttribute(
                'role',
                'button'
            );


            rect.setAttribute(
                'aria-label',

                `${room.displayNumber} - ${room.hostelName}`

            );


            rect.dataset.room =
                room.id;


            rect.__roomData =
                room;

        });


        const available =

            data.filter(

                room =>

                    room.configured &&

                    !room.full

            ).length;


        const full =

            data.filter(

                room =>

                    room.configured &&

                    room.full

            ).length;


        const bestText =

            best == null

                ? '—'

                : `${best}%`;


        const availableElement =
            $('#mapAvailableRooms');


        if (availableElement) {

            availableElement.textContent =
                available;

        }


        const fullElement =
            $('#mapFullRooms');


        if (fullElement) {

            fullElement.textContent =
                full;

        }


        const bestElement =
            $('#mapBestScore');


        if (bestElement) {

            bestElement.textContent =
                bestText;

        }

    }


    /* =========================================================
       ROOM INTERACTIONS
       ========================================================= */

    function attachInteractions() {

        const svg =
            $('#hostelMapCanvas svg');

        if (!svg) {
            return;
        }


        $$(
            'rect[id^="R"]',
            svg
        ).forEach(rect => {

            const roomId =
                roomKey(rect.id);




            const show = event => {

                if (
                    !rect.__roomData
                ) {
                    return;
                }


                if (
                    tooltipPinned
                ) {
                    return;
                }


                renderTooltip(

                    rect.__roomData,

                    event.clientX,

                    event.clientY,

                    false

                );

                loadVirtualTour(
                    rect.__roomData
                )

            };


            rect.addEventListener(
                'mouseenter',
                show
            );


            rect.addEventListener(
                'mousemove',
                show
            );


            rect.addEventListener(
                'mouseleave',
                scheduleHideTooltip
            );


            rect.addEventListener(
                'focus',
                () => {

                    const box =
                        rect.getBoundingClientRect();


                    renderTooltip(

                        rect.__roomData,

                        box.left +
                        box.width / 2,

                        box.top +
                        box.height / 2,

                        true

                    );

                }
            );


            rect.addEventListener(
                'blur',
                scheduleHideTooltip
            );


            rect.addEventListener(
    'click',
    event => {

        event.stopPropagation();


        const rectBox =
            rect.getBoundingClientRect();


        renderTooltip(
            rect.__roomData,

            rectBox.left +
            rectBox.width / 2,

            rectBox.top +
            rectBox.height / 2,

            true
        );


        /*
            LOAD VIRTUAL TOUR
            FOR THIS ROOM
        */

        loadVirtualTour(
            rect.__roomData
        );

    }
);

        });


        /*
            Allows mouse to move from room
            into tooltip without immediately
            closing it.
        */

        const tooltip =
            $('#roomTooltip');


        tooltip?.addEventListener(
            'mouseenter',
            () => {

                clearTimeout(
                    hideTimer
                );

            }
        );


        tooltip?.addEventListener(
            'mouseleave',
            () => {

                if (!tooltipPinned) {

                    scheduleHideTooltip();

                }

            }
        );


        document.addEventListener(
            'click',
            event => {

                if (

                    !event.target.closest(
                        '#roomTooltip'
                    ) &&

                    !event.target.closest(
                        '#hostelMapCanvas rect'
                    )

                ) {

                    forceHideTooltip();

                }

            }
        );

    }


    /* =========================================================
       RENDER SHELL
       ========================================================= */

    function renderShell() {

        const mount =
            $('#hostelMapMount');

        if (!mount) {
            return;
        }


        mount.innerHTML = `

            <div class="hostel-map-feature">


                <div class="hostel-map-heading">

                    <div>

                        <div class="hostel-map-eyebrow">

                            LIVE ROOM AVAILABILITY

                        </div>

                        <h3>

                            Hostel Floor Map

                        </h3>

                        <p>

                            Select a hostel and floor.
                            Hover over a room for details,
                            or click it to explore its
                            virtual tour.

                        </p>

                    </div>


                </div>


                <!-- HOSTEL CONTROLS -->

                <div class="hostel-map-controls">

                    <div class="hostel-control">

                        <label for="hostelSelect">

                            Hostel

                        </label>

                        <select id="hostelSelect">

                            <option value="boys">

                                Boys Hostel

                            </option>

                            <option value="girls">

                                Girls Hostel

                            </option>

                        </select>

                    </div>


                    <div class="hostel-control">

                        <label for="floorSelect">

                            Floor

                        </label>

                        <select id="floorSelect">

                            ${CONFIG.floors.map(floor => `

                                <option
                                    value="${floor.value}"
                                >

                                    ${floor.label}

                                </option>

                            `).join('')}

                        </select>

                    </div>


                    <div class="current-location">

                        <span>
                            CURRENT VIEW
                        </span>

                        <strong id="currentMapLocation">

                            Boys Hostel · Ground Floor

                        </strong>

                    </div>

                </div>


                <div class="hostel-map-stats">

                    <div>

                        <span>

                            AVAILABLE ROOMS

                        </span>

                        <strong
                            id="mapAvailableRooms"
                        >
                            —
                        </strong>

                    </div>


                    <div>

                        <span>

                            FULL ROOMS

                        </span>

                        <strong
                            id="mapFullRooms"
                        >
                            —
                        </strong>

                    </div>


                    <div>

                        <span>

                            BEST COMPATIBILITY

                        </span>

                        <strong
                            id="mapBestScore"
                        >
                            —
                        </strong>

                    </div>

                </div>


                <div class="hostel-map-layout">

    <!-- LEFT SIDE: MAP -->

    <div
        class="hostel-map-shell"
        id="hostelMapShell"
    >

        <div
            class="hostel-map-canvas"
            id="hostelMapCanvas"
        >

            <div class="hostel-map-loading">
                Loading hostel map…
            </div>

        </div>


        <div
            class="room-tooltip"
            id="roomTooltip"
            aria-live="polite"
        ></div>

    </div>


    <!-- RIGHT SIDE: VIRTUAL TOUR -->

    <aside
        class="virtual-tour-panel"
        id="virtualTourPanel"
    >

        <div class="virtual-tour-panel-header">

            <div>

                <span class="virtual-tour-label">
                    360° VIRTUAL TOUR
                </span>

                <h4 id="selectedTourRoom">
                    Select a room
                </h4>

                <p id="selectedTourLocation">
                    Choose any room from the map
                </p>

            </div>

        </div>


        <div
            class="virtual-tour-viewer"
            id="virtualTourViewer"
        >

            <div class="tour-placeholder">

                <div class="tour-placeholder-icon">
                    🌐
                </div>

                <h3>
                    Explore the Hostel
                </h3>

                <p>
                    Hover over or click a room
                    to load its virtual tour.
                </p>

            </div>

        </div>

    </aside>

</div>


                <div
                    class="hostel-map-legend"
                >

                    <span>

                        <i
                            class="legend-dot available"
                        ></i>

                        Seat available

                    </span>


                    <span>

                        <i
                            class="legend-dot full"
                        ></i>

                        Full

                    </span>


                    <span>

                        <i
                            class="legend-dot best"
                        ></i>

                        Best compatibility

                    </span>

                </div>


                <div
                    class="hostel-map-info"
                >

                    <span
                        class="hostel-map-info-icon"
                    >
                        i
                    </span>

                    <span>

                        Hover for room details.
                        Click a room to keep the details
                        open and access its Virtual Tour.

                    </span>

                </div>


                


            </div>

        `;


        const hostelSelect =
            $('#hostelSelect');


        const floorSelect =
            $('#floorSelect');


        hostelSelect.value =
            selectedHostel;


        floorSelect.value =
            selectedFloor;


        hostelSelect.addEventListener(
            'change',
            async event => {

                selectedHostel =
                    event.target.value;


                await loadMap();

            }
        );


        floorSelect.addEventListener(
            'change',
            async event => {

                selectedFloor =
                    Number(
                        event.target.value
                    );


                await loadMap();

            }
        );


        updateCurrentLocation();

    }


    /* =========================================================
       UPDATE CURRENT LOCATION
       ========================================================= */

    function updateCurrentLocation() {

        const element =
            $('#currentMapLocation');


        if (!element) {
            return;
        }


        element.textContent =

            `${getHostelName(
                selectedHostel
            )} · ${getFloorLabel(
                selectedFloor
            )}`;

    }


    /* =========================================================
       LOAD MAP
       ========================================================= */

    async function loadMap() {

        const canvas =
            $('#hostelMapCanvas');

        if (!canvas) {
            return;
        }


        

        forceHideTooltip();

        updateCurrentLocation();


        canvas.innerHTML = `

            <div class="hostel-map-loading">

                Loading ${getHostelName(
                    selectedHostel
                )} · ${getFloorLabel(
                    selectedFloor
                )}…

            </div>

        `;


        try {

            const response =
                await fetch(
                    CONFIG.mapUrl
                );


            if (!response.ok) {

                throw new Error(
                    'Map file could not be loaded.'
                );

            }


            const svgText =
                await response.text();


            canvas.innerHTML =
                svgText;


            const svg =
                canvas.querySelector(
                    'svg'
                );


            if (svg) {

                svg.setAttribute(

                    'viewBox',

                    '0 0 640 480'

                );


                svg.setAttribute(

                    'preserveAspectRatio',

                    'xMidYMid meet'

                );


                svg.removeAttribute(
                    'width'
                );


                svg.removeAttribute(
                    'height'
                );

            }


            const [

                rooms,

                allocations,

                students

            ] = await Promise.all([

                HostelAPI.getRooms(),

                HostelAPI.getAllocations(),

                HostelAPI.getStudents()

            ]);


            roomsCache =

                Array.isArray(rooms)

                    ? rooms

                    : [];


            allocationsCache =

                Array.isArray(allocations)

                    ? allocations

                    : [];


            studentsCache =

                Array.isArray(students)

                    ? students

                    : [];


            const data =
                buildRoomData();


            applyRoomStates(
                data
            );


            attachInteractions();


        }

        catch (error) {

            console.error(
                '[Hostel Map]',
                error
            );


            canvas.innerHTML = `

                <div
                    class="hostel-map-error"
                >

                    Unable to load the hostel map.

                    Please refresh the Room tab.

                </div>

            `;

        }

    }


    /* =========================================================
       INITIALIZATION
       ========================================================= */

    function init() {

        renderShell();


        const roomTab =
            $('[data-tab="room"]');


        roomTab?.addEventListener(
            'click',
            () => {

                setTimeout(
                    loadMap,
                    50
                );

            }
        );


        window.addEventListener(
            'hostelStudentReady',
            loadMap
        );


        if (
            window.currentStudentStatus
        ) {

            loadMap();

        }

    }


    if (

        document.readyState ===
        'loading'

    ) {

        document.addEventListener(

            'DOMContentLoaded',

            init

        );

    }

    else {

        init();

    }

})();