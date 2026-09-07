# Local handoff — deployment intentionally withheld

## Completed local fixes

- Keyboard, touch, gamepad and visible WASD controls preserve independent held-key ownership. D turns the car right and moves the character camera-right. Shift modifiers are captured at press time for actions such as stock selling.
- Additional vendors, payphones, ATMs and the car-wash arch were moved clear of road lanes. Land race start rings are shallow road markers rather than tall barriers. The site audit now checks 47 reserved activity sites; all are off-road. Non-solid mission/waypoint beams are intentionally retained.
- Moving train colliders are queried dynamically; district/roadblock changes invalidate the static grid even when the collider count stays unchanged.
- Standing web launches receive a small vertical lift so they cannot immediately count as a landing. Airborne catches retain their existing vertical momentum.
- Local purchases costing more than $10,000 can use cash plus local savings. Smaller purchases retain cash-only rules. Online funds are never spent based only on a cached browser balance.
- Bank typing remains stable across frames, transactions cannot be double-clicked concurrently, and the panel pauses gameplay. Shift+K opens the bank; K retains skateboard control. Overflow deposits show a toast instead of forcibly opening the panel.
- New Game+ explicitly resets cash/savings instead of accidentally granting the new-player welcome cash. Prison-reported escapes bypass the random civilian-witness rule.

## Admin email — configuration still required

Render's free web-service tier blocks SMTP ports 25, 465 and 587. Correct SMTP passwords alone cannot fix that hosting restriction. Source: https://render.com/docs/free

The backend now supports an HTTPS delivery path without an extra SDK:

    MAIL_PROVIDER=resend
    RESEND_API_KEY=<set privately on the server>
    MAIL_FROM=<verified sender address>
    ADMIN_EMAIL=<recipient address>

Use the provider's domain verification and recipient rules. API reference: https://resend.com/docs/api-reference/emails/send-email

Alternatively set MAIL_PROVIDER=smtp on an SMTP-capable host and configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and ADMIN_EMAIL. Gmail app-password display spaces are removed; other providers' password spaces are preserved.

Use Node 24 LTS. Start the backend from arena-protocol-project/server with npm.cmd start, then open its /admin route. The static preview server cannot send admin tokens. The example .env contains no secrets; do not overwrite an existing .env or paste credentials into chat.

Mock mail and local admin/browser checks passed. No real mail was sent, no provider account created, and live inbox delivery is not claimed. After privately configuring a provider, an approved end-to-end delivery/login check is still necessary.

## Local-only verification

Run from the repository root:

    node --test test/admin-mail.test.mjs test/input.test.mjs test/wallet.test.mjs
    node test/admin-integration.mjs
    node test/run-local-suite.mjs

The suite owns a temporary loopback server and stops it afterwards. Browser tests require Edge and network access to the existing Three.js CDN. Focused additional checks:

    node test/run-local-suite.mjs final-regressions visual-review street-review

Tests, screenshots and reports remain local under ignored test/ and artifacts/. Previously tracked tests/QA helpers were removed from the Git index but retained on disk. CI still builds and syntax-checks; it no longer expects private local test files.

The latest headless desktop visual sample measured 16.9 ms median and 34.3 ms p95 frame time, 815,318 triangles and 1,660 draw calls. This is one local sample, not a guarantee of 60 FPS on phones or VR headsets. See artifacts/final-review/report.json. Detailed security findings and release gates are in artifacts/full-review/SECURITY_REVIEW.md.

## AWS EC2 — feasible, not provisioned

Assuming “AWS S2” means EC2: the Node/Express/Socket.IO backend can run on an EC2 VM. This does not move Three.js rendering off players' CPUs/GPUs. It can improve backend capacity and remove free-service sleep constraints, but VM sizing needs expected concurrent players and a load test, not just polygon counts.

Before any migration: choose a budget/region, use Node 24 LTS, configure an HTTPS reverse proxy with WebSocket support, restrict management access, preserve the managed PostgreSQL database/backups, configure mail, measure concurrency, and retain a rollback plan. Keep the app's private port off the public security group. AWS security groups control ingress and egress: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html

EC2 restricts outbound port 25 by default; use an HTTPS email provider or a supported SMTP submission port with suitable network rules. https://docs.aws.amazon.com/en_en/ses/latest/dg/send-email-set-up-vpc-endpoints.html

No AWS resources, billing changes, DNS changes, migration, push or deployment were performed.

## Three.js animations and WebXR

The project already uses Three.js. Better character animation can use rigged GLB/glTF assets and AnimationMixer for walking/running/turning/blended actions; asset quality, materials and lighting determine realism, not simply importing the library. https://threejs.org/docs/pages/AnimationMixer.html

WebXR is feasible as an optional VR/AR mode. It requires supported browser/device and HTTPS, an XR animation loop, controller input, a player rig, XR-compatible UI/rendering and comfort/performance work. Desktop bloom/composer rendering cannot simply be assumed to work unchanged in VR. Keep the ordinary keyboard/touch game as fallback. https://threejs.org/manual/en/webxr-basics.html

Neither a new animation asset pipeline nor WebXR was implemented in this bug-fix pass. Resolve the security release gates and test normal play before expanding into those features.
