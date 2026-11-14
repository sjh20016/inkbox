# WX-E-M2 decision and rollback

Status: A measurement and combined acceptance are in progress. B production implementation is gated on the frozen A result. C remains isolated research, with no product entry or fixed clock enabled.

The new instrumentation changes no business rule, RNG stream, dt, save schema or Life pass lifetime. It is off by default. Current integration preserves the original once-per-rAF variable dt and the original 0.12-second cap. This package provides attribution and gates, not a claim that long frames have been fixed.

Attribution must distinguish Life's prepare/entity/post phases, actual low-frequency clocks, renderer/projection, Stage, gated HUD/stats, browser long tasks, driver scheduling and rAF waiting. Existing synchronous product code has zero queued simulation transactions; the deficit between elapsed-wall target and completed days is separately recorded rather than presented as an implemented catch-up queue.

Read debt for B: Three forces `renderFrame(...,{refresh:true})`; Canvas still reads terrain/faction colors; Three derive reads factions/wanling/wraiths; TerrainReadView returns owned mutable typed arrays; query/HUD/G1/S1/FX/camera and picking retain authority reads. Stage drains events before simulation each display frame. Publishing a new commit must not drain those queues again or change event visibility order. Any future in-progress guard must fail closed for unconverted consumers, not label a live World wrapper as isolation.

Rollback is a new reviewed revert of the E-M2 instrumentation, package/CI entries and the corresponding reviewed registry changes. Leave the evidence and source baseline available; there is no save migration. Independently disabling diagnostics requires no rollback. Never reset/force-push or merge this work to main automatically.
