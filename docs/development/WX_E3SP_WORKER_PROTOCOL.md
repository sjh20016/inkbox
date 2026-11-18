# Worker fallback boundary

No Worker is automatically enabled by this research branch. A possible next backend owns one persistent private simulation context in the Worker, receives an initial exact checkpoint once, and accepts ordered commands plus coalesced target watermarks and priority pause/replace/save controls. It must not accumulate an unbounded advance message per display frame or send complete World snapshots after every step.

Commit packets contain generation/sequence/day, finite entity and query DTOs, native ordered committed events and bounded dirty terrain packets. Acknowledged delivery watermarks provide backpressure. The UI retains immutable last-complete facts; buffer reuse must never mutate a retained old frame. Saves are explicit v11 serialization at a complete boundary. Faults stop authority progress; restore/replay and source/RNG identity require the same proof as this prototype.

Moving computation does not by itself prove scheduler equivalence. Backend L0 must replay exactly the same dt list, command execution boundaries, rift conditions and initial checkpoint. A fixed3 or target-watermark live scheduler remains L2 against the formal variable-dt product and needs separate W6 ecology approval. Main-thread paint, terrain uploads, DTO allocation and browser/GPU waits remain costs even with a Worker.

Migration still requires full G1/Story/Settlement/FX query and event contracts, removal of borrowed World references from Three/Canvas legacy surfaces, serialized G7 command admission/History semantics, checkpoint compatibility, bounded transport/backpressure, pause/background/replacement races and real Edge input/throughput measurements. Expected responsiveness is a hypothesis until tested; no Worker speedup is claimed here.
