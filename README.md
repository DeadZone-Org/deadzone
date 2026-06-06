<img src="mobile/assets/icon.png" width="84" align="left" alt="Deadzone" />

# DEADZONE — Send crypto in a dead zone

<br clear="left" />

> **No signal? No problem.** DEADZONE lets you pay anyone with **zero internet**. Your gasless, offline-signed payment hops across a Bluetooth mesh of nearby phones — *Deadzone's couriers* — until one reaches connectivity, where an **autonomous AI agent** validates it, batches it, settles it on **Mantle**, and earns **verifiable on-chain reputation (ERC-8004)** for delivering it honestly.

Built for the **Mantle Turing Test Hackathon 2026** — *AI Awakening*.

---

## 🎯 Which track — and why

**Primary track: Consumer & Viral DApps** ("shareable consumer applications").
**North star:** Grand Champion (cross-track) nomination.
**Stacked awards we design for from day one:** Best UI/UX · Community Voting · 20-Project Deployment.

Why this track:
- Per the **official** criteria, it's the only track whose requirements DEADZONE meets natively, and it has **no forced sponsor SDK** — just the general requirements + the hackathon-wide defining features. (See `docs/BUILD_PLAN.md` §12 for the full track-fit + sponsor-tech audit.)
- The hackathon's whole thesis is *"autonomous agents creating verifiable, on-chain value,"* benchmarked on-chain, with **ERC-8004 agent identity**. DEADZONE's gateway agent is exactly that — an autonomous agent that makes a real economic decision (when/whether/how to settle) and records it permanently on Mantle.
- DEADZONE owns a demo almost no other team can show: **a payment that moves with no internet.** That is intrinsically *shareable* (Community Voting) and *accessible* (Best UI/UX — gasless, no wallet popup, "it just worked offline").
- Every track here is an **AI** track and the deployment award requires **an AI function callable on-chain** — DEADZONE's agent writes its settlement decision to ERC-8004, clearing that bar.

> Sponsor-tech compliance: DEADZONE uses the tech the event actually requires — **Mantle** (settlement, MNT gas, verified contracts), **ERC-8004** (mandatory agent identity), and **on-chain benchmarking** (decisions recorded on Mantle) — plus **Z.ai GLM** (a judge) for the agent brain. The Consumer track has no forced sponsor SDK, so Byreal/Bybit/Tencent are intentionally not bolted on.

---

## 🧠 What it is (plain English)

When you have no internet, you still can't move crypto — every wallet needs to reach an RPC node. DEADZONE fixes that. You sign a **gasless** payment offline (EIP-3009 meta-transaction — no gas, no popup). Your phone broadcasts it over **Bluetooth Low Energy** to nearby phones, which relay it hop-by-hop until it reaches a device that *does* have connectivity — the **gateway**.

At the gateway, DEADZONE doesn't blindly forward. An **autonomous AI agent ("the Deadzone")** takes over: it validates each authorization (signature, nonce, expiry, balance — and rejects the bad ones), **batches** the valid ones to save gas, **pre-commits its decision on-chain** to ERC-8004 *before* settling (so the record can't be faked after the fact), settles them on **Mantle**, and posts the outcome. For honest delivery, the Deadzone earns an **on-chain reputation** tied to its **ERC-8004 identity NFT** — and can be tipped a fee. Relaying value becomes a paid, reputation-bearing service: **an economy of autonomous couriers.**

---

## 🏗️ Architecture

```
[Phone A: sign offline] --BLE--> [Phone B: relay] --BLE--> [Gateway: AI Settlement Agent]
   EIP-3009 meta-tx          (no internet)                       |
   gasless, no popup                                             v
                                          1. validate (reject bad auths)
                                          2. plan + batch (gas-aware)
                                          3. PRE-COMMIT decision -> ERC-8004 ValidationRegistry
                                          4. SETTLE on Mantle (DeadzoneSettlement.sol)
                                          5. ATTEST outcome + reputation -> ERC-8004
                                          6. self-correct on revert
```

### Monorepo layout
```
courier/
├── contracts/     # Solidity (Foundry): EIP-3009 token + DeadzoneSettlement + ERC-8004 wiring
├── agent/         # TypeScript Settlement Agent (the AI core) — validate→plan→pre-commit→settle→attest
├── shared/        # chain config (Mantle), ABIs, types — used by agent + web
├── web/           # public demo dApp (mesh map + live agent-reasoning panel + courier card)
├── docs/          # build plan, demo script, submission checklist
└── (mobile)       # offline BLE app — reuses NONET's proven mesh transport
```

### The three pieces that make it on-thesis (not just a payments app)
1. **Settlement Agent** — a real tool-calling AI agent (default model: Z.ai GLM — a hackathon judge). Its decisions are *consequential*: it rejects invalid authorizations, chooses the batch, picks gas. Lives in `agent/`.
2. **ERC-8004 identity + reputation** — each courier registers an identity NFT, pre-commits each settlement decision (Validation Registry), and accrues a reputation record per honest delivery. The "verifiable on-chain value" the judges keep asking for.
3. **DeadzoneSettlement contract** — records *which agent settled which payment* on Mantle, enabling the reputation + tip economy. Lives in `contracts/`.

---

## ⛓️ Mantle deployment

- Network: **Mantle Sepolia (chainId 5003)** for the demo → **Mantle mainnet (5000)** if time allows.
- Gas paid in **MNT**.
- Contracts **verified on Mantlescan** (hard submission bar + the deployment award).
- AI-on-chain function: the agent's `validationRequest`/`giveFeedback` writes to ERC-8004 = the required on-chain AI function.

---

## 🎬 The demo moment (what judges remember)

Two phones in **airplane mode**, one online laptop as gateway. Phone A signs a payment (gasless, no internet). The packet visibly hops **A → B → gateway**. The gateway agent **narrates live**: *"3 authorizations · 1 expired → rejected · 2 valid · batching · Mantle gas 0.02 gwei · committing decision to ERC-8004 #… · settling."* The courier's reputation NFT ticks up; a Mantlescan link proves it.

> *"No phone touched the internet except the last hop — and the autonomous courier that carried this payment just earned un-fakeable reputation on Mantle for delivering it."*

---

## 🚦 Status

- [x] Project scaffold + Mantle chain config
- [x] `DeadzoneToken` (EIP-3009) + `DeadzoneSettlement` contracts
- [ ] Foundry build + deploy + verify on Mantle Sepolia
- [ ] Settlement Agent (validate → plan → pre-commit → settle → attest → self-correct)
- [ ] ERC-8004 identity + reputation integration
- [ ] Public web demo (mesh map + agent reasoning + courier card)
- [ ] Mobile BLE transport (reuse NONET) + 2-min demo video
- [ ] Submission: README, open repo, X thread `#MantleAIHackathon`, DoraHacks BUIDL

See `docs/` for the full build plan and submission checklist.
