# DEADZONE — Master Build Plan

**Product:** DEADZONE — *autonomous offline payments that settle themselves on Mantle.*
**Event:** Mantle Turing Test Hackathon 2026 (*AI Awakening*).
**Primary track:** Consumer & Viral DApps — sponsored by **Animoca Minds × OpenCheck** (per Mantle devhub: **no specific SDK/tech requirement**).
**North star:** Grand Champion (cross-track) — "$9k, Top Overall Business Potential, Completion & Mantle Ecosystem Fit".
**Stacked awards:** Best UI/UX ($3k) · Community Voting (2×$8.5k, "Highest Engagement on X") · Finalist & Deployment (20×$1k, "Top 20 deployed on Mantle"). Track First Prize = $8.5k.
**Platforms:** Web dApp (React) + **Mobile: Android only** (iOS deferred — see §10).
**Agent brain:** tiered LLM tool-calling agent — **Z.ai GLM (judge) → Claude (Anthropic) → deterministic** — so it never breaks live (order configurable via `LLM_ORDER`).

> ⏰ **KEY DATES (validated against Mantle devhub, 2026-06-04):** **Phase II submission deadline — June 15, 2026** (≈11 days out). Demo Day — July 2–3. Winners — July 10. *This is tight: build to a submittable MVP by June 15 (see §16).*

> This document is the single source of truth for the build. It is exhaustive on purpose. Status lives in §15 and is updated as we go.

---

## 1. One-paragraph concept

You sign a payment **offline and gasless** (EIP-3009 meta-transaction — no internet, no wallet popup). It rides a **Bluetooth Low Energy mesh** of nearby Android phones, hopping device-to-device until one reaches connectivity — the **gateway**. There, an **autonomous AI Settlement Agent** validates each payment (rejecting expired/invalid ones), **batches** the valid ones to save gas, **pre-commits its decision to ERC-8004 on-chain *before* settling** (so the record can't be faked), **settles** on **Mantle**, and **attests** the outcome — earning **on-chain reputation** tied to its **ERC-8004 identity NFT** for honest delivery. Relaying value becomes a paid, reputation-bearing service: *an economy of autonomous couriers.*

### Why it wins this hackathon (the thesis fit)
- The organizers want *"autonomous agents creating verifiable, on-chain value,"* benchmarked on-chain, with **ERC-8004 identity**. DEADZONE's gateway is literally an autonomous agent making a real economic decision and recording it permanently on Mantle.
- DEADZONE owns a demo nobody else can show: **money moving with no internet** — intrinsically shareable (Community Voting) and accessible (Best UI/UX).
- Every track is an AI track; the deployment award requires an **AI function callable on-chain** — the agent's ERC-8004 write clears it.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         OFFLINE  (no internet)                              │
│  [Android A: sign] --BLE--> [Android B: relay] --BLE--> [Gateway: online]   │
│   EIP-3009 meta-tx           rebroadcast                      │             │
│   gasless, no popup                                           │             │
└───────────────────────────────────────────────────────────────┼────────────┘
                                                                 │  ONLINE
                                                                 ▼
                                   ┌──────────────────────────────────────────┐
                                   │      AI SETTLEMENT AGENT (agent/)         │
                                   │  1. validate  (reject bad/expired auths)  │
                                   │  2. plan      (LLM GLM + det. fallback)   │
                                   │  3. pre-commit keccak256(plan) → ERC-8004 │
                                   │  4. settle    → DeadzoneSettlement (Mantle)│
                                   │  5. attest    outcome + reputation        │
                                   │  6. self-correct on revert                │
                                   └──────────────────────────────────────────┘
                                                                 │
                                                                 ▼
                            Mantle Sepolia (5003): DeadzoneToken, DeadzoneSettlement,
                                                   ERC-8004 Identity/Validation/Reputation
```

### Monorepo layout
```
courier/
├── contracts/          # Solidity (Foundry) — the on-chain truth                [DONE]
│   ├── src/DeadzoneToken.sol        # EIP-3009 gasless token
│   ├── src/DeadzoneSettlement.sol       # settle + record which courier delivered
│   ├── test/Deadzone.t.sol              # 3 passing tests
│   ├── script/Deploy.s.sol             # (Phase 2) deploy + wire
│   └── foundry.toml
├── shared/             # cross-package config/types                            [DONE: chains.ts]
│   ├── chains.ts                       # Mantle config + deployed addresses
│   ├── abis.ts                         # (Phase 1) generated ABIs for agent/web
│   └── types.ts                        # (Phase 1) Authorization, SettlementPlan, ...
├── agent/              # the AI Settlement Agent (shared TS brain)             [NEXT]
│   ├── src/types.ts
│   ├── src/validate.ts                 # deterministic, authoritative validation
│   ├── src/rulesEngine.ts              # deterministic planner (the fallback)
│   ├── src/llmAgent.ts                 # GLM tool-calling agent → falls back to rules
│   ├── src/erc8004.ts                  # identity / validation / reputation writes
│   ├── src/chainView.ts                # RPC reads (balance, nonce, gas) + mock for tests
│   ├── src/settlementAgent.ts          # orchestrator (the 6-step loop)
│   ├── src/gateway.ts                  # long-running gateway runner (used by mobile/web)
│   ├── src/demo.ts                     # runnable reasoning demo (dry-run, no keys)
│   └── test/agent.test.ts
├── web/                # React dApp — public demo judges score                 [Phase 4]
├── mobile/             # React Native/Expo, ANDROID — reuses NONET's BLE mesh  [Phase 5]
└── docs/               # this plan, demo script, submission checklist          [DONE: this file]
```

### Design principle
**Build the engine (contracts + agent) once; put two faces on it (web + Android).** Web and mobile are thin front-ends over the same shared agent + ABIs. That is what makes "both apps" feasible solo.

---

## 3. Tech stack

| Layer | Stack | Notes |
|---|---|---|
| Contracts | Solidity 0.8.24, Foundry, OpenZeppelin v5 | EIP-3009 + EIP-712; tested |
| Agent | TypeScript (ESM), Node 24, ethers v6, `tsx` runner | LLM via Z.ai GLM (OpenAI-compatible HTTP); native `fetch` |
| LLM | Z.ai GLM-4 (judge) + deterministic fallback | no hard dependency on the model for a working demo |
| On-chain identity | ERC-8004 (Identity / Validation / Reputation registries) | thin fallback attestation contract if not live on 5003 |
| Web | React + Vite (or Next.js), wagmi/viem or ethers, Tailwind | public non-localhost URL required |
| Mobile | React Native + Expo (dev build), **Android** | `react-native-ble-advertiser` + `react-native-ble-plx`; lift NONET mesh |
| Chain | Mantle Sepolia 5003 (demo) → Mantle 5000 (stretch) | gas in MNT |

---

## 4. End-to-end lifecycle of one payment (the sequence)

1. **Sign (offline, Android A).** User enters amount + recipient. App builds an EIP-3009 `TransferWithAuthorization` and signs it with the local key via `signTypedData`. No network, no gas, no popup. Output: a compact `Authorization {from,to,value,validAfter,validBefore,nonce,signature}`.
2. **Fragment + broadcast (BLE).** The authorization is serialized and fragmented into the NONET 11-byte BLE packets (`id | totalChunks | chunkIndex | 8-byte data`) and advertised over BLE GAP.
3. **Relay (BLE).** Nearby Android phones receive fragments, reassemble, and re-broadcast — the mesh hop. No internet anywhere on this path.
4. **Gateway detects connectivity.** A node with internet (NetInfo) reassembles a complete authorization and hands it to the **Settlement Agent** queue instead of blindly submitting.
5. **Agent validates.** For each queued auth: recover signer == from, check `validAfter < now < validBefore`, nonce unused on-chain, `balanceOf(from) >= value`. Invalid ones are rejected with a reason. *(Authoritative — the LLM cannot override this.)*
6. **Agent plans.** LLM (GLM) decides ordering, batching, gas bid, settle-now-vs-hold over the *valid* set; on any failure/no-key it uses the deterministic planner. Output: `SettlementPlan`.
7. **Pre-commit.** Agent writes `keccak256(plan)` to ERC-8004 Validation Registry **before** settling → non-backfittable proof of the decision.
8. **Settle.** Agent calls `DeadzoneSettlement.settleBatch(courierAgentId, items)` on Mantle, paying gas in MNT. Bad items are skipped on-chain (try/catch) — self-correction.
9. **Attest.** Agent posts the realized outcome (which nonces landed, gas used) + a reputation record (`giveFeedback`) to ERC-8004. The courier's identity NFT reputation ticks up.
10. **Acknowledge (BLE, optional).** A settlement receipt propagates back through the mesh to the sender.

---

## 5. ERC-8004 + on-chain benchmarking design (the "verifiable value")

- **Identity:** on first run each courier calls `IdentityRegistry.register()` → ERC-8004 identity NFT + `agentId`; binds its settlement wallet via `setAgentWallet` (EIP-712).
- **Validation (pre-commit → reveal):** `validationRequest(validator, agentId, requestURI, keccak256(plan))` before settling; `validationResponse(requestHash, score, responseURI)` after, with the realized result. This is the un-fakeable benchmark the hackathon advertises.
- **Reputation:** `giveFeedback(agentId, tag="honest-relay", score)` per delivered payment → `getSummary(agentId)` is a live courier trust score the UI + other nodes read. (Cheap on-chain mirror: `DeadzoneSettlement.deliveries[agentId]`.)
- **Dynamic NFT:** the identity NFT `image` renders live reputation (payments delivered, value settled, success rate) → a "courier card" (Best UI/UX + Animoca "ownable agent" hook).
- **Fallback:** if the canonical ERC-8004 registries are not deployed on Mantle Sepolia, ship a thin `AttestationRegistry.sol` mirroring `validationRequest/Response` + `giveFeedback`, and migrate addresses later. Verify on Mantlescan/8004scan before wiring.

---

## 6. The Settlement Agent in detail (Phase 1)

### Module responsibilities
- **`types.ts`** — `Authorization`, `RejectedAuth`, `SettlementPlan {settleNow, reject, batched, gasPriceWei, rationale, source:'llm'|'fallback'}`, `ChainView`, `DeadzoneIdentity`.
- **`validate.ts`** — `validateAuth(auth, view, ctx)` using `ethers.verifyTypedData` over the same EIP-712 domain the contract uses; returns `{ok, reason?}`. **Authoritative.**
- **`rulesEngine.ts`** — `planDeterministic(valid, reject, view)`: batch if >1 valid, read gas, write a human-readable `rationale`. This is the fallback and the safety net.
- **`llmAgent.ts`** — `planWithLLM(valid, reject, view, opts)`: calls GLM with tool definitions (`validate`, `readGas`, `batchPlan`), parses a structured decision, then **intersects `settleNow` with the validated set** (LLM can never inject an invalid payment), `source='llm'`. Any error / missing `ZAI_API_KEY` → `planDeterministic`.
- **`chainView.ts`** — `RpcChainView` (ethers provider: `now`, `isNonceUsed`, `balanceOf`, `gasPriceWei` via Mantle GasPriceOracle) + `MockChainView` for offline tests.
- **`erc8004.ts`** — `register()`, `preCommit(planHash)`, `attest(outcome)`, `giveFeedback(score)`; no-ops with a warning when addresses are unset (so dry-run always works).
- **`settlementAgent.ts`** — `class SettlementAgent { process(queue, {dryRun}) }` runs the 6-step loop; settlement uses `settleBatch`; on revert it drops/replaces and logs recovery.
- **`gateway.ts`** — `runGateway(opts)`: a loop that drains the queue on connectivity-gained; imported by the Android gateway node and the web demo.
- **`demo.ts`** — signs 3 authorizations with a throwaway ethers wallet (one deliberately expired), runs the agent in `dryRun` with `MockChainView`, and prints the live reasoning + plan + simulated on-chain writes. **Runs with zero keys/network.**

### Agent invariants (non-negotiable)
1. The LLM never settles an authorization that failed deterministic validation.
2. Every settled batch is pre-committed on-chain before submission.
3. A single bad authorization never blocks the rest (on-chain try/catch + agent retry).
4. The agent always produces a plan, even with no API key or no network (fallback).

---

## 7. Phase-by-phase plan

### Phase 0 — Scaffold + on-chain core ✅ DONE
- [x] Monorepo skeleton, README, `.gitignore`, Mantle `shared/chains.ts`
- [x] `DeadzoneToken.sol` (EIP-3009: transfer/receive/cancel-with-authorization, mint)
- [x] `DeadzoneSettlement.sol` (settle, settleBatch w/ skip-on-fail, `settledBy`, `deliveries`)
- [x] Foundry + OZ v5 compiling; **3 tests pass** (settle / no-double-settle / batch-skips-bad)
- **Deliverable:** provable on-chain value layer. **Runs here.**

### Phase 1 — Settlement Agent (the AI core) ▶ NEXT
- [ ] `agent/` package (ethers v6, tsx, typescript) — *this is the npm install to approve*
- [ ] `types.ts`, `validate.ts`, `rulesEngine.ts`, `chainView.ts` (+ mock)
- [ ] `llmAgent.ts` (GLM + fallback), `erc8004.ts` (graceful no-op), `settlementAgent.ts`, `gateway.ts`
- [ ] `demo.ts` runnable reasoning demo + `test/agent.test.ts`
- **Deliverable:** `npm run demo` prints the agent validating, rejecting a bad auth, batching, pre-committing, settling (simulated), attesting. **Runs here (no keys).**
- **Prereq from you:** none for dry-run; later, `ZAI_API_KEY` to enable the real LLM path.

### Phase 2 — Deploy to Mantle + live settlement
- [ ] `script/Deploy.s.sol` (deploy token + settlement, mint demo supply)
- [ ] Deploy to **Mantle Sepolia (5003)**, **verify on Mantlescan**, fill `shared/chains.ts` `ADDRESSES`
- [ ] Generate ABIs → `shared/abis.ts`
- [ ] Point the agent's `RpcChainView` at Mantle; settle a real signed payment end-to-end
- **Deliverable:** a real Mantle tx where the agent settles an offline-signed payment. **You run the deploy** (needs key + faucet); I prep the scripts + walk you through it.
- **Prereqs from you:** a funded Mantle Sepolia deployer key (faucet: `faucet.sepolia.mantle.xyz`), `MANTLESCAN_API_KEY` for verification.

### Phase 3 — ERC-8004 identity + reputation (real)
- [ ] Confirm canonical ERC-8004 registry addresses on Mantle (else deploy `AttestationRegistry.sol` fallback)
- [ ] Register courier identity NFT; wire `preCommit`/`attest`/`giveFeedback` into real registries
- [ ] Dynamic NFT metadata endpoint rendering live reputation
- **Deliverable:** the courier has a real on-chain identity + a growing, verifiable reputation. **Runs here + on Mantle.**

### Phase 4 — Web dApp (React) — the judged demo
- [ ] Vite + React + Tailwind app in `web/`; wallet connect; read Mantle
- [ ] **Mesh map** (animated packet hops phone→phone→gateway)
- [ ] **Agent reasoning panel** (streams the agent's live rationale + the reject/batch/commit/settle steps)
- [ ] **Deadzone card** (ERC-8004 reputation, dynamic NFT, Mantlescan links)
- [ ] "Run the agent" button that triggers a real settlement on testnet
- [ ] Deploy to a public URL (Vercel/Netlify)
- **Deliverable:** the public, non-localhost demo that wins Best UI/UX + Community Voting. **Builds + previews here; you deploy the public URL.**

### Phase 5 — Mobile app (Android) — the offline moat
- [ ] Expo dev build (Android), config plugin for BLE permissions
- [ ] **Lift NONET's BLE mesh** (`bleUtils.ts`, `BleContext.tsx`) + wallet + EIP-3009 signing into `mobile/`
- [ ] Wire the gateway path to the shared Settlement Agent (`agent/gateway.ts`)
- [ ] Two-device offline send → relay → gateway-settles flow on real phones
- **Deliverable:** the real "send crypto with no internet" experience on Android. **I write it here; you build + run on your machine + 2 Android phones.**
- **Prereqs from you:** Android Studio / a machine with the Android SDK + 2 Android phones with Bluetooth.
- **Note:** iOS deferred (see §10).

### Phase 6 — Submission polish
- [ ] ≥2-min demo video (script in `docs/DEMO_SCRIPT.md`)
- [ ] README with deployed + verified contract addresses, architecture, setup
- [ ] Open-source repo public; X thread with `#MantleAIHackathon` (pitch + video + repo + address)
- [ ] Register BUIDL on DoraHacks; expose the agent as a callable "Minds" skill for Track-4 Part-B
- **Deliverable:** a complete, compliant submission. **You post the X thread + DoraHacks BUIDL.**

---

## 8. What we lift from NONET (don't rebuild the hard part)
- **Keep:** the BLE mesh transport (`utils/bleUtils.ts`, `contexts/BleContext.tsx`), packet fragmentation, the wallet, and the EIP-3009 offline-signing flow. These are proven and Android-friendly.
- **Replace the one seam:** in `BleContext.tsx` the gateway currently calls `submitTransactionToBlockchain(...)` directly (~line 303 when `hasInternet`). DEADZONE routes that into the **Settlement Agent** queue instead.
- **Add:** the agent, ERC-8004, `DeadzoneSettlement`, Mantle config, the reasoning UI.

---

## 9. Environment & prerequisites (what you must provide)
| When | What | Where |
|---|---|---|
| Phase 1 (optional) | `ZAI_API_KEY` (Z.ai GLM) to enable the real LLM path | `.env` |
| Phase 2 | Funded **Mantle Sepolia** deployer private key | `.env` `DEPLOYER_PK` |
| Phase 2 | Testnet MNT | faucet.sepolia.mantle.xyz |
| Phase 2 | `MANTLESCAN_API_KEY` (contract verification) | `.env` |
| Phase 5 | Machine with **Android SDK** (Android Studio) | your laptop |
| Phase 5 | **2 Android phones** with Bluetooth | for the mesh demo |
| Phase 6 | X account + DoraHacks account | submission |

**Security:** never commit `.env` (already in `.gitignore`); rotate NONET's old hardcoded test key; use fresh demo wallets.

---

## 10. Platform decision: Android-only mobile (documented)
- React Native runs on both iOS and Android, but **iOS restricts BLE advertising** (no custom/manufacturer data in advertisements; iOS↔Android custom-broadcast interop effectively unsupported), and **building iOS needs a Mac + a paid Apple Developer account.**
- NONET's mesh is advertisement-broadcast based → Android-native. Porting to iOS would require a GATT-connection rebuild of the transport.
- **Decision:** mobile is **Android-only** for the hackathon. iPhone users are served by the **web dApp** (works in Safari). This costs no points — judges score the demo + the on-chain agent.
- Revisit iOS post-hackathon with a GATT transport if needed.

---

## 11. Demo script (the 30-second moment)
Two Android phones in **airplane mode**, one online laptop as gateway.
1. Phone A signs a payment — **gasless, no internet, no popup**.
2. The packet visibly hops **A → B → gateway** on the mesh map; both phones offline.
3. The gateway agent **narrates live:** *"3 authorizations · 1 expired → rejected · 2 valid · batching · Mantle gas 0.02 gwei · committing decision to ERC-8004 #… · settling."*
4. The courier's reputation NFT ticks up; a **Mantlescan** link proves the settlement + the pre-commit.
- **Kill line:** *"No phone touched the internet except the last hop — and the autonomous courier that carried this payment just earned un-fakeable reputation on Mantle for delivering it."*

Full shot-by-shot lives in `docs/DEMO_SCRIPT.md` (created in Phase 6).

---

## 12. Track fit & sponsor-tech compliance (READ THIS)

> Reconciled against Mantle's official devhub (validated 2026-06-04). **Animoca Minds × OpenCheck sponsor/judge the Consumer track, but there is NO specific SDK/tech requirement** — so building with Animoca Minds is *optional and favorable*, not mandatory. The earlier inference of a *required* "Minds Capability" plus a 50/50 "Part A/Part B" rubric is unconfirmed and dropped; we anchor on the Grand Champion rubric + the award criteria instead.

### Track requirement audit
| Track | Hard requirement (official) | DEADZONE fit |
|---|---|---|
| AI Trading & Strategy (BGA) | quant/macro trading; Bybit API support | ✗ not a trading product |
| AI Alpha & Data (Mirana) | Mantle on-chain data as **core** source | ✗ not analytics |
| AI x RWA (Mantle) | must involve **real-world assets** | ✗ not RWA |
| **Consumer & Viral DApps** | shareable consumer app; **general reqs only** | ✅ clean fit, no forced sponsor SDK |
| AI DevTools | Mantle-specific dev tooling | ✗ not devtools |
| Agentic Wallets & Economy (Byreal) | **MUST use Byreal Agent Skills / Perps CLI / RealClaw** | ✗ DEADZONE uses none |

**Decision: enter Consumer & Viral DApps.** Only track whose *requirements* DEADZONE meets natively, and the only one with **no forced sponsor SDK** — just the general requirements (deploy on Mantle, open-source + runnable demo + one-line pitch) plus the hackathon-wide defining features.

**Why not Byreal's "Agentic Wallets & Economy"** (which thematically matches "agentic wallet economy"): it *requires* Byreal Agent Skills / Perps CLI / RealClaw. DEADZONE is offline payments, not Byreal DeFi trading; bolting RealClaw on would be a forced, story-diluting fit. If we ever want a *second* submission, a genuine RealClaw integration could target that track — but we will not contort DEADZONE to do it.

### Sponsored / required tech DEADZONE uses (the "on-point" checklist)
- ✅ **Mantle Network** — settlement, gas in MNT, EIP-3009 token + DeadzoneSettlement deployed + **verified**. (Required by every track + Grand Champion "Mantle Ecosystem Contribution 25%".)
- ✅ **ERC-8004 agent identity** — required hackathon-wide ("every participating AI agent is issued a unique identity NFT via ERC-8004"). Central to DEADZONE (courier identity + reputation).
- ✅ **On-chain benchmarking** — required defining feature ("every agent decision and outcome recorded on Mantle"). DEADZONE pre-commits each decision + attests the outcome.
- ✅ **Z.ai GLM** — the agent's LLM brain. Z.ai is a judge + AI partner → favorable (optional, not required).
- ➕ **(Optional, favorable) Animoca Minds × OpenCheck alignment** — they judge this track. Our **ERC-8004 courier identity NFT + on-chain reputation = an ownable, composable, "tradeable agent" identity**, which is squarely Animoca's thesis. OpenCheck (verification/proof) aligns with our pre-commit/attest verifiability. Lean into these narratively; integrate their SDK only if it's cheap and strengthens the entry.
- ➖ **Byreal/RealClaw, Bybit API, Tencent Cloud, Nansen** — NOT required for the Consumer track; intentionally not forced in.

### Deepen "Mantle Ecosystem Contribution" (Grand Champion 25%)
- Settle **Mantle-native value**: support any EIP-3009 token; demo uses our `dUSD`, roadmap targets Mantle USDC / mUSD where EIP-3009/permit is supported — so moved value is Mantle-ecosystem value.
- Long-term value framing: offline settlement **expands Mantle's reach** to no-connectivity regions, emerging markets, and disaster scenarios — net-new users and transactions for the ecosystem.

---

## 12b. How DEADZONE earns points (official criteria)

**Grand Champion (cross-track) — 30 / 25 / 25 / 20** *(our north star; a Consumer winner can be nominated):*
- **Technical Depth 30%** (AI × on-chain integration, architecture, code quality) → the agent's validate → pre-commit → settle → attest loop writing to ERC-8004 on Mantle; tested contracts; clean monorepo.
- **Innovation 25%** → offline mesh settlement + an autonomous **courier reputation economy** — a new AI × Web3 paradigm (agents earning verifiable reputation for delivering value with no internet).
- **Mantle Ecosystem Contribution 25%** → EIP-3009 token + settlement + ERC-8004 on Mantle, MNT gas, Mantle-native asset support, offline reach as ecosystem growth.
- **Product Completeness 20%** → public web demo + Android app + ≥2-min video.

**Best UI/UX — Visual 30 / Interaction 30 / AI Interaction Design 25 / Accessibility 15** → polished mesh map; the **agent-reasoning panel** (AI presented naturally = the 25% lever); gasless / no-popup onboarding (Accessibility 15).

**Community Voting (X)** → the "send crypto with no internet" clip — clear to non-technical users, real pain point, shareable.

**20 Project Deployment (hard bars)** → verified contract on Mantle + the on-chain AI function (ERC-8004 write) + public frontend + ≥2-min video + open repo with the deployed address.

---

## 13. Submission checklist / do-not-fail (from rubric research)
- [ ] Consumer track **general requirements** met: deploy on Mantle, open-source + runnable demo + one-line pitch. (No forced sponsor SDK for this track — re-verify on the live DoraHacks page in case a sub-rubric is added.)
- [ ] Nominated from at least one track (required for Grand Champion eligibility).
- [ ] Core functionality runs **end-to-end on Mantle**.
- [ ] **AI function callable on-chain** (the ERC-8004 validation write).
- [ ] Contract **deployed + verified on Mantlescan**; deployment address in the submission.
- [ ] Public **non-localhost** frontend URL.
- [ ] **Demo video ≥ 2 minutes.**
- [ ] Open-source repo + README (setup, architecture, deployed address).
- [ ] X thread with `#MantleAIHackathon`; BUIDL on DoraHacks.
- [ ] ERC-8004 identity minted.
- [ ] No black-box / no chatbot-only / no fork-without-contribution / no leaked keys.

---

## 14. Risks & mitigations
| Risk | Mitigation |
|---|---|
| BLE flaky on stage | Record the real offline run for the video; deterministic replay for live; ERC-8004 records prove it was real |
| "AI is cosmetic" | Agent decisions are consequential (rejects, batches, picks gas) + on-chain; **show a live rejection** |
| LLM call fails / no key | Deterministic fallback always produces a plan; demo never depends on the model |
| ERC-8004 not live on 5003 | Thin `AttestationRegistry.sol` fallback mirroring the interface |
| Track-4 fit (Minds skill) | Expose the agent as a callable skill; confirm Part-B on the live DoraHacks page |
| Leaked keys | `.env` + `.gitignore`; rotate NONET's old test key; fresh demo wallets |
| Scope creep (fee market, multi-courier) | Ship the single-courier verifiable loop first; economy is roadmap |
| iOS BLE limits | Android-only mobile; web dApp covers iPhone (§10) |

---

## 15. Status / changelog
- **2026-06-04 — Phase 0 complete.** Monorepo scaffolded; `DeadzoneToken.sol` + `DeadzoneSettlement.sol` written, compiling (Foundry + OZ v5); **3 Foundry tests passing**; `shared/chains.ts`, README, `.gitignore` done.
- **2026-06-04 — Criteria reconciliation.** Re-read the official judging criteria. Corrected track strategy to §12: confirmed **Consumer & Viral DApps** (no forced sponsor SDK), removed the unverified "Animoca Minds Capability / 50-50 Part A-B" inference, retargeted scoring to **Grand Champion 30/25/25/20 + Best UI/UX + Community Voting + 20-Project Deployment**, and documented sponsor-tech compliance (Mantle + ERC-8004 + on-chain benchmarking + Z.ai GLM; Byreal intentionally not forced).
- **2026-06-04 — Validated vs Mantle devhub.** Confirmed: 6 tracks; **Consumer & Viral DApps sponsored by Animoca Minds × OpenCheck with NO required SDK**; Agentic Economy requires Byreal Skills CLI (so we stay in Consumer); ERC-8004 identity mandatory. Prizes: Grand Champion $9k, Track First $8.5k, Community Voting 2×$8.5k, Best UI/UX $3k, Finalist&Deployment 20×$1k. **⏰ Phase II submission deadline = June 15, 2026; Demo Day Jul 2–3; winners Jul 10.** Compressed the sequencing (§16) to an 11-day, web-first MVP plan.
- **2026-06-04 — Phase 1 COMPLETE.** Settlement Agent built + working: validate → plan (real **Z.ai GLM `glm-4.5-flash`, thinking disabled, + retry + deterministic fallback**) → pre-commit (ERC-8004 sim) → settle (dry-run) → attest. `npm run demo` shows GLM writing the batch rationale live; **5/5 unit tests pass, typecheck clean.** GLM key + deployer wallet (`0x73A5…b9Eb`, ~4 MNT) configured in gitignored `.env`. Model note: `glm-4-flash` is retired; use `glm-4.5-flash` (free) with `thinking:{type:'disabled'}`.
- **2026-06-04 — Phase 2 COMPLETE.** Deployed to **Mantle Sepolia (5003)**: DeadzoneToken `0xA76cb5e60e97070736FE553Ea352aac1940E0706`, DeadzoneSettlement `0x30c4c47e6f50D8027AB670E3d2FDcFDB5A5b8e58` (token wiring verified on-chain; deployer holds 1M dUSD). **Live end-to-end settlement proven** — the GLM-driven agent settled a real 100 dUSD offline-signed payment: tx `0x582bb0477fcb424ff0f545169d660ac94bc5ac16835f43ca3bfd7ba8ea166174`. Addresses saved to `shared/chains.ts`; `npm run settle:live` reproduces it.
- **2026-06-04 — Agent brain upgraded to a 3-tier chain.** Planner now resolves **GLM → Claude (Anthropic) → deterministic** (`LLM_ORDER`, `LLM_RETRIES` per provider). Verified: Claude path returns valid plans, and a forced GLM failure auto-falls-through to Claude. 5/5 tests pass, typecheck clean. Env documented in `agent/.env.example`.
- **2026-06-04 — Renamed COURIER → DEADZONE** ("Send crypto in a dead zone"). Full rename across folder/files/contracts/package/docs (lowercase "courier" kept as the relay-agent noun). **Redeployed to Mantle Sepolia:** DeadzoneToken (dUSD) `0x3887c55b01d5664d8ABa7dB526C9bf24BfAe4272`, DeadzoneSettlement `0xBC133614d147216beA6219189f3F5c4358fcf870`. Re-verified end-to-end: 3 Foundry + 5 agent tests pass, typecheck clean, live GLM settlement tx `0x8f09a77e2bcd93ca8d6eb2df4d2c394cfdd0ba1c091d66e8ec8e3cd62475c0e2`. `shared/chains.ts` keys now `deadzoneToken`/`deadzoneSettlement`. (Old Courier-named contracts remain on-chain but superseded.)
- **Next:** Phase 3 — real ERC-8004 identity + pre-commit/attest (confirm registry addresses on Mantle, else deploy the thin attestation fallback). Then Phase 4 — web dApp. Pending: verify contracts on Mantlescan (needs a Mantlescan API key) for the 20-Project Deployment award.

---

## 16. Recommended sequencing — compressed for the **June 15** deadline (≈11 days)

The deadline forces ruthless prioritization. **Lock a submittable MVP first; treat the Android/BLE app as the upgrade.** Target dates (from 2026-06-04):

| Days | Work | Gate |
|---|---|---|
| Jun 4–6 | Phase 1 — Settlement Agent + reasoning demo (here) | agent runs end-to-end in dry-run |
| Jun 6–8 | Phase 2 + 3 — deploy + verify on Mantle Sepolia, ERC-8004 identity + pre-commit/attest | a real on-chain settlement by the agent |
| Jun 8–12 | Phase 4 — Web dApp (public URL): mesh viz + agent-reasoning panel + courier card | **public, non-localhost demo live** |
| Jun 12–14 | Phase 6 — ≥2-min demo video, README + addresses, X thread `#MantleAIHackathon`, **DoraHacks BUIDL submitted** | **SUBMITTED (meets all hard bars)** |
| Jun 14–15 | Buffer + polish | safety margin |
| (stretch / pre-Demo-Day Jul 2–3) | Phase 5 — Android BLE app (real offline demo on 2 phones) | the moat, for the finals |

**Why web-first:** the web dApp + the on-chain agent + ERC-8004 already satisfy every hard bar (deployed+verified on Mantle, on-chain AI function, public frontend, video, open repo) and the Grand Champion / Best UI/UX criteria. The **Android offline-BLE app is the moat for Demo Day**, but it must not jeopardize hitting June 15. If Android isn't phone-tested by Jun 14, submit with a recorded mesh demo + the live web dApp, and finish Android for the finals.

**Decision point for you:** do we (A) web-first MVP by Jun 15 with Android as a Demo-Day upgrade [recommended, safest], or (B) push Android BLE hard now [higher-risk, but the offline demo is in the submission video]? This changes day-1 priorities.
