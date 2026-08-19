(() => {
    const CONFIG = {
        mapUrl: 'assets/hostel/floorplan.svg',

        roomIds: Array.from(
            { length: 20 },
            (_, i) => String(i + 1).padStart(2, '0')
        ),

        weights: {
            year: 0.40,
            region: 0.30,
            hobbies: 0.30
        }
    };

    let roomsCache = [];
    let allocationsCache = [];
    let studentsCache = [];

    const $ = (selector, root = document) =>
        root.querySelector(selector);

    const $$ = (selector, root = document) =>
        Array.from(root.querySelectorAll(selector));

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function normalize(value) {
        return String(value ?? '').trim().toLowerCase();
    }

    function parseHobbies(value) {
        return new Set(
            String(value ?? '')
                .split(/[,;|]/)
                .map(h => normalize(h))
                .filter(Boolean)
        );
    }

    /*
       HOBBY COMPATIBILITY
       Jaccard similarity:
       common hobbies / total unique hobbies
    */
    function hobbyScore(a, b) {
        const A = parseHobbies(a);
        const B = parseHobbies(b);

        if (!A.size || !B.size) return 0;

        let common = 0;

        A.forEach(hobby => {
            if (B.has(hobby)) {
                common++;
            }
        });

        const union = new Set([...A, ...B]).size;

        return union
            ? (common / union) * 100
            : 0;
    }

    /*
       YEAR COMPATIBILITY

       Same year       = 100
       Adjacent year   = 50
       Otherwise       = 0
    */
    function yearScore(a, b) {
        const A = normalize(a);
        const B = normalize(b);

        if (!A || !B) return 0;

        if (A === B) {
            return 100;
        }

        const yearA = parseInt(A, 10);
        const yearB = parseInt(B, 10);

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

    /*
       FINAL COMPATIBILITY

       Year      = 40%
       Region    = 30%
       Hobbies   = 30%
    */
    function compatibility(me, other) {

        const year = yearScore(
            me?.Year || me?.year,
            other?.Year || other?.year
        );

        const myRegion = normalize(getRegion(me));
        const otherRegion = normalize(getRegion(other));

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
            total: Math.round(total * 10) / 10
        };
    }

    function getCurrentStudent() {
        const status = window.currentStudentStatus || {};

        return (
            status.applicationDetails ||
            status.student ||
            status
        );
    }

    function roomKey(value) {
        const raw = String(value ?? '').trim();

        const match = raw.match(/(\d{1,2})$/);

        return match
            ? match[1].padStart(2, '0')
            : raw.padStart(2, '0');
    }

    /*
       MapRoom is preferred.

       Example:
       MapRoom = 01
       RoomNumber = B-101
    */
    function getRoom(roomNumber) {

        const key = roomKey(roomNumber);

        return roomsCache.find(room =>
            roomKey(
                room.MapRoom ||
                room.MapRoomNumber ||
                room.mapRoom ||
                room.RoomNumber ||
                room.roomNumber ||
                room.RoomID
            ) === key
        );
    }

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
                        normalize(allocation.Status)
                    );

                return (
                    active &&
                    (
                        (
                            roomId &&
                            allocationRoomId === roomId
                        ) ||
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
                ) ||
                allocation
            );
        });
    }

    function buildRoomData() {

        const me = getCurrentStudent();

        return CONFIG.roomIds.map(id => {

            const room = getRoom(id);

            const configured = Boolean(room);

            const safeRoom =
                room ||
                {
                    RoomNumber: id,
                    Capacity: 0,
                    Occupied: 0,
                    VacantBeds: 0,
                    Status: 'Not configured'
                };

            const capacity =
                Number(safeRoom.Capacity) || 0;

            const occupied =
                Number(safeRoom.Occupied) || 0;

            const vacant =
                Number(safeRoom.VacantBeds);

            const seats =
                configured && Number.isFinite(vacant)
                    ? Math.max(0, vacant)
                    : configured
                        ? Math.max(
                            0,
                            capacity - occupied
                        )
                        : 0;

            const members =
                getMembers(safeRoom);

            const scores =
                members.map(member =>
                    compatibility(me, member).total
                );

            const score =
                scores.length
                    ? Math.round(
                        (
                            scores.reduce(
                                (a, b) => a + b,
                                0
                            ) / scores.length
                        ) * 10
                    ) / 10
                    : null;

            return {
                id,
                room: safeRoom,
                configured,
                capacity,
                occupied,
                seats,
                full: seats <= 0,
                members,
                score
            };
        });
    }

    function renderTooltip(data, x, y) {

        const tooltip =
            $('#roomTooltip');

        if (!tooltip) return;

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
                                    ${escapeHTML(name)}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        member.EnrollmentNo || ''
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
                    <span>ROOM</span>

                    <strong>
                        ${escapeHTML(data.id)}
                    </strong>
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

            <div class="room-tooltip-note">
                ${
                    data.configured
                        ? 'Year 40% · Region 30% · Hobbies 30%'
                        : 'Add MapRoom to the Rooms sheet to connect this room.'
                }
            </div>
        `;

        tooltip.classList.add('visible');

        const shell =
            $('#hostelMapShell');

        if (!shell) return;

        const shellRect =
            shell.getBoundingClientRect();

        const width =
            tooltip.offsetWidth || 290;

        const height =
            tooltip.offsetHeight || 220;

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

    function hideTooltip() {

        $('#roomTooltip')
            ?.classList.remove('visible');
    }

    function applyRoomStates(data) {

        const svg =
            $('#hostelMapCanvas svg');

        if (!svg) return;

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

            if (!rect) return;

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

            } else {

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
                `Room ${room.id}`
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

    function attachInteractions() {

        const svg =
            $('#hostelMapCanvas svg');

        if (!svg) return;

        $$(
            'rect[id^="R"]',
            svg
        ).forEach(rect => {

            const show =
                event => {

                    renderTooltip(
                        rect.__roomData,
                        event.clientX,
                        event.clientY
                    );
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
                hideTooltip
            );

            rect.addEventListener(
                'focus',
                () => {

                    const rectBox =
                        rect.getBoundingClientRect();

                    renderTooltip(
                        rect.__roomData,
                        rectBox.left +
                            rectBox.width / 2,
                        rectBox.top +
                            rectBox.height / 2
                    );
                }
            );

            rect.addEventListener(
                'blur',
                hideTooltip
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
                            rectBox.height / 2
                    );
                }
            );
        });
    }

    function renderShell() {

        const mount =
            $('#hostelMapMount');

        if (!mount) return;

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
                            Hover over a room to view occupancy,
                            roommates and your compatibility score.
                        </p>

                    </div>

                    <div class="hostel-map-weights">

                        <span>
                            <b>40%</b> Year
                        </span>

                        <span>
                            <b>30%</b> Region
                        </span>

                        <span>
                            <b>30%</b> Hobbies
                        </span>

                    </div>

                </div>

                <div class="hostel-map-stats">

                    <div>
                        <span>
                            AVAILABLE ROOMS
                        </span>

                        <strong id="mapAvailableRooms">
                            —
                        </strong>
                    </div>

                    <div>
                        <span>
                            FULL ROOMS
                        </span>

                        <strong id="mapFullRooms">
                            —
                        </strong>
                    </div>

                    <div>
                        <span>
                            BEST COMPATIBILITY
                        </span>

                        <strong id="mapBestScore">
                            —
                        </strong>
                    </div>

                </div>

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

                <div class="hostel-map-legend">

                    <span>
                        <i class="legend-dot available"></i>
                        Seat available
                    </span>

                    <span>
                        <i class="legend-dot full"></i>
                        Full
                    </span>

                    <span>
                        <i class="legend-dot best"></i>
                        Best compatibility
                    </span>

                </div>
                <div class="hostel-map-info">

                    <span class="hostel-map-info-icon">
                        i
                    </span>

                    <span>
                        Hover over any room to view occupancy,
                        roommates and compatibility with you.
                    </span>

                </div>

            </div>
        `;
    }

    async function loadMap() {

        const canvas =
            $('#hostelMapCanvas');

        if (!canvas) return;

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

            const svgText = await response.text();

            canvas.innerHTML = svgText;

            const svg = canvas.querySelector('svg');

            if (svg) {
                svg.setAttribute(
                    'viewBox',
                    '0 0 640 480'
                );

                svg.setAttribute(
                    'preserveAspectRatio',
                    'xMidYMid meet'
                );

                svg.removeAttribute('width');
                svg.removeAttribute('height');
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

            applyRoomStates(data);

            attachInteractions();

        } catch (error) {

            console.error(
                '[Hostel Map]',
                error
            );

            canvas.innerHTML = `
                <div class="hostel-map-error">
                    Unable to load the live hostel map.
                    Please refresh the Room tab.
                </div>
            `;
        }
    }

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

        if (window.currentStudentStatus) {
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
    } else {
        init();
    }

})();