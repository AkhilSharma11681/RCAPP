# Milo 2.0 — Data Flow Diagram

**Companion to:** `MILOO_MILO_2_0_DESIGN.md`
**Format:** Mermaid (renders in GitHub, VS Code preview, and most static-site generators)

---

## 1. End-to-end flow (sequence diagram)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant CR as ChatRoom.jsx<br/>(React client)
    participant SK as Socket.IO<br/>(server/index.js)
    participant MM as /api/milo<br/>(Express)
    participant RL as RateLimiter<br/>(per fingerprint)
    participant MOD as Output<br/>Moderator
    participant LLM as LLM Provider<br/>(Groq or Claude)
    participant GA as GA / trackEvent

    U->>CR: Click "Find Someone" (MoodSelect)
    CR->>SK: socket.connect()<br/>auth: { fingerprint }
    SK-->>CR: connect
    CR->>SK: emit find_match { mood, intent, mediaMode }
    SK->>SK: queueUser(socketId, mood, intent)
    SK-->>CR: 'waiting'

    Note over CR: setInterval(waitingTime) ticks every 1s
    CR->>CR: 8s (text) / 15s (video) elapsed
    CR->>CR: setIsMiloActive(true)
    CR->>GA: milo_2_activated { waitSeconds, mode, mood, persona }
    CR->>CR: Render mood-tuned opener bubble

    U->>CR: Type "hey, how's it going?"
    CR->>CR: Append user bubble
    CR->>MM: POST /api/milo<br/>{ messages, persona, fingerprint }
    MM->>RL: check(fingerprint)
    alt under limit
        RL-->>MM: ok
        MM->>LLM: chat.completions.create(messages + system)
        LLM-->>MM: reply text
        MM->>MOD: isSuspiciousMessage(reply)
        alt clean
            MOD-->>MM: pass
        else flagged
            MOD-->>MM: "haha okay 😅"
        end
        MM-->>CR: 200 { reply }
        CR->>CR: Append assistant bubble (aria-live=polite)
        CR->>GA: milo_2_message_sent { messageLength, sessionMessageIndex }
    else over limit
        RL-->>MM: capped
        MM-->>CR: 200 { reply: "Heads up — I'm pausing..." }
        CR->>GA: milo_2_session_capped
    end

    Note over SK,CR: Meanwhile, a real user joins
    SK->>SK: findMatch(socketA) → socketB<br/>createPair(A, B)
    SK-->>CR: 'match_found' { partnerId, starter, partnerMediaMode }

    alt Milo is active
        CR->>CR: Append persona-aware goodbye bubble
        CR->>GA: milo_2_handoff_completed { miloMessagesExchanged, totalWaitSeconds, mode }
        Note over CR: 1.8s grace period
        CR->>CR: status = 'text_chat' / 'connected'<br/>Hide Milo UI, reveal real chat
    else Milo not active (fast match)
        CR->>CR: status = 'text_chat' / 'connected' immediately
    end

    SK->>SK: WebRTC offer/answer + ICE<br/>(video mode only, existing flow)
```

---

## 2. Component / data-store view

```mermaid
flowchart LR
    subgraph Client["🖥️  Client (React + Vite)"]
        UI[ChatRoom.jsx]
        LS[(localStorage<br/>miloo_persona)]
        GAG[utils/analytics.js<br/>trackEvent]
    end

    subgraph Server["🟢  Server (Node + Express + Socket.IO)"]
        SOCK[io.on connection<br/>socket handlers]
        MMAPI["/api/milo<br/>(Express route)"]
        RL[("In-memory rate limit<br/>Map<fingerprint,<br/>{count, windowStart}>")]
        USRMETA[("userMeta Map<br/>lastMood, lastIntent,<br/>mediaMode")]
        PAIR[("activePairs Map<br/>& waitingQueue array")]
    end

    subgraph LLM["🧠  LLM Provider"]
        GROQ[Groq SDK<br/>llama-3.3-70b-versatile]
        CLAUDE{{"Anthropic SDK<br/>claude-haiku-4-5<br/>(optional, env-flag)"}}
    end

    subgraph External["📊  External"]
        GA[(Google Analytics)]
    end

    UI <-->|socket.io events<br/>find_match, match_found,<br/>receive_message, partner_left| SOCK
    UI <-->|HTTPS POST<br/>messages, persona| MMAPI
    UI <-->|read/write persona| LS
    UI -->|trackEvent calls| GAG --> GA

    SOCK <--> USRMETA
    SOCK <--> PAIR

    MMAPI --> RL
    MMAPI --> GROQ
    MMAPI -. env: MILOO_USE_CLAUDE .-> CLAUDE
```

---

## 3. State machine — `status` in ChatRoom.jsx (extended)

```mermaid
stateDiagram-v2
    [*] --> pre_permission: chatMode = video
    [*] --> text_connecting: chatMode = text

    pre_permission --> connecting: click "Allow Camera"
    pre_permission --> [*]: click "Go back"

    text_connecting --> waiting: socket connect<br/>+ find_match emit
    connecting --> waiting: getUserMedia ok<br/>+ find_match emit
    connecting --> cam_error: permission denied

    cam_error --> connecting: "Continue as Text"

    waiting --> milo_active: 8s (text) or 15s (video) elapsed<br/>and isMiloActiveRef = false
    waiting --> text_chat: match_found (fast path)
    waiting --> connected: match_found (fast path, video)
    waiting --> slow_down: 'slow_down' event
    waiting --> busy: 'server_busy' event

    milo_active --> text_chat: match_found<br/>+ 1.8s grace + goodbye
    milo_active --> connected: match_found<br/>+ 1.8s grace + goodbye
    milo_active --> milo_capped: 20 msgs / 10 min
    milo_active --> waiting: 'slow_down' (back to queue)

    slow_down --> waiting: countdown elapsed<br/>auto re-emit find_match

    text_chat --> waiting: findNext() / partner_left
    text_chat --> partner_left: 'partner_left' event
    connected --> partner_left: 'partner_left' event
    connected --> waiting: findNext() / peer_dropped

    partner_left --> waiting: 2.5s auto-resume<br/>(if duration > 15s)

    busy --> [*]
    milo_capped --> text_chat: match_found
    milo_capped --> connected: match_found
```

---

## 4. Data shape — `POST /api/milo` (request & response)

```mermaid
classDiagram
    class MiloRequest {
      +Array~Message~ messages
      +string persona  // 'milo' | 'mira' | 'jax' (optional)
    }
    class Message {
      +string role  // 'user' | 'assistant'
      +string content  // ≤ 500 chars (server-truncated)
    }
    class MiloResponse {
      +string reply  // ≤ 200 chars, output-moderated
    }
    class RateLimitError {
      +string reply  // "Heads up — I'm pausing..."
      +429 status
    }
    MiloRequest "1" o-- "*" Message
```

---

## 5. Failure & resilience paths

```mermaid
flowchart TD
    REQ[POST /api/milo] --> RL{per-fingerprint<br/>limit ok?}
    RL -- no --> CAP[200 reply: 'pausing...'<br/>+ GA: milo_2_session_capped]
    RL -- yes --> LLM[Call LLM]
    LLM -->|5xx / timeout| ERR[Client catch:<br/>show fallback bubble]
    ERR -->|1st / 2nd strike| KEEP[Keep Milo active]
    ERR -->|3rd strike in 60s| DEAD[Disable Milo for session<br/>toast: 'Milo is taking a break']
    LLM -->|200| MOD{isSuspiciousMessage<br/>on reply?}
    MOD -- yes --> SAFE[Replace with 'haha okay 😅']
    MOD -- no --> CHK{reply.length > 200?}
    CHK -- yes --> TRUNC[Truncate to 200 chars]
    CHK -- no --> OK[Return reply]
    SAFE --> OK
    TRUNC --> OK
    OK --> RESP[200 { reply }]
```

---

## 6. Telemetry map (where each event fires)

```mermaid
flowchart LR
    subgraph Client["ChatRoom.jsx"]
        ACT[milo_2_activated<br/>@ setIsMiloActive]
        SEND[milo_2_message_sent<br/>@ sendMiloMessage success]
        PICK[milo_2_persona_chosen<br/>@ persona card click]
        CAP[milo_2_session_capped<br/>@ capped reply received]
        HO[milo_2_handoff_completed<br/>@ match_found + isMiloActiveRef]
    end
    subgraph Server["server/index.js"]
        RL_T[milo_rate_limited<br/>@ /api/milo over limit]
    end
    GA[(Google Analytics)]
    ACT --> GA
    SEND --> GA
    PICK --> GA
    CAP --> GA
    HO --> GA
    RL_T -.optional.-> GA
```
