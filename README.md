# QX Claude Strategy

A research harness for testing whether any binary-option setup on Quotex beats
break-even. It is designed to kill ideas quickly and cheaply.

**Status: v0.1.0, Phase 0.** No strategy exists yet. The harness passes its own
planted-edge self-test and is waiting for its first real capture.

The previous project's strategy was measured on 26,734 clean rows and came in
at 50.4% against a 52–57% break-even. This project starts from what that one
got right: the data tap, symbol attribution, and the measurement rig. See
`LESSONS.md`.

## How it works

1. **Capture.** A read-only Chrome extension records the 1-minute candle
   history Quotex already sends the chart. Each frame is filed under the
   symbol the frame names, or dropped. Nothing leaves the browser.
2. **Export.** The toolbar popup saves the capture as a JSON file. Put it in
   `data/`.
3. **Check.** `integrity` looks for splices, shared series, impossible jumps,
   frozen bars and gaps. Failing series are excluded from everything.
4. **Screen.** A hypothesis is a small JS file with a `decide(view, ctx)`
   function. The harness settles its trades at 1m, 5m or 15m expiry. It
   reports each OTC and real cell separately, against break-even and a
   matched null, with Holm correction, and returns SURVIVES, KILL, or how many
   more trades it needs.
5. **Holdout, once.** Survivors get one look at the newest third of the data.

The rules are in `PROTOCOL.md`: pre-registration, a one-look holdout, and a
stop after 10 consecutive kills.

## Setup

Requires Node 22+. No dependencies.

```bash
npm test
```

```bash
node harness/bin/qx.js selftest
```

**Load the extension:** `chrome://extensions` → Developer mode → Load unpacked
→ select the `extension/` folder. Open Quotex, then open each asset you want
captured, so its chart history loads. Click the toolbar icon, then **Export
dataset**.

```bash
node harness/bin/qx.js integrity data/qx_capture_YYYYMMDDTHH.json
```

## Safety

The extension is read-only and local-only. It never trades or clicks, has only
the `storage` permission, and makes no network calls. Captured data lives in
extension-scoped session storage, which the site can't read and which is
cleared when the browser closes.
