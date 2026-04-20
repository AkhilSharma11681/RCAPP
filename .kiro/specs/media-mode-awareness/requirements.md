# Requirements Document

## Introduction

Miloo is a random video chat platform where two strangers are matched and can communicate via video, audio, and text. Currently, when two users are matched, one may have a camera active while the other does not — due to denied permissions, a missing device, or a deliberate text-only choice. Neither user is informed of the other's media capability, the WebRTC connection may partially fail with uncaught errors, and the UI shows broken or black video elements with no explanation.

This feature introduces **media mode awareness**: each user's media capability is detected on join, exchanged with their matched partner via Socket.io, and surfaced in the UI with clear, non-intrusive indicators. WebRTC negotiation is made graceful so that mismatched media modes degrade cleanly without errors, and text chat continues to work in all combinations.

## Glossary

- **Media Mode**: One of three states describing a user's available media: `video` (camera + mic active), `audio` (mic only, no camera), or `text` (no camera, no mic).
- **Signaling Server**: The Node.js + Socket.io server (`server/index.js`) that brokers connections between matched users.
- **ChatRoom**: The React component (`client/src/pages/ChatRoom.jsx`) that renders the full chat UI.
- **WebRTC**: The browser peer-to-peer protocol used for video and audio streaming between matched users.
- **PeerConnection**: An `RTCPeerConnection` instance representing the WebRTC session between two matched users.
- **Partner**: The other user in an active matched session.
- **Placeholder**: A styled UI element shown in place of a video element when no video stream is available.
- **Mode Indicator**: A non-intrusive badge or banner shown in the ChatRoom UI to communicate the partner's media mode.
- **getUserMedia**: The browser API (`navigator.mediaDevices.getUserMedia`) used to request camera and microphone access.
- **ICE Candidate**: A network address candidate exchanged during WebRTC negotiation.
- **Offer/Answer**: The SDP (Session Description Protocol) messages exchanged to establish a WebRTC PeerConnection.

---

## Requirements

### Requirement 1

**User Story:** As a user joining Miloo, I want the app to detect what media I have available, so that I am placed into the correct mode without manual configuration.

#### Acceptance Criteria

1. WHEN a user initiates a video chat session, THE ChatRoom SHALL attempt to acquire camera and microphone via `getUserMedia` with `{ video: true, audio: true }`.
2. WHEN `getUserMedia` succeeds with both video and audio tracks, THE ChatRoom SHALL assign the user a media mode of `video`.
3. WHEN `getUserMedia` fails or returns a stream with no video tracks but at least one audio track, THE ChatRoom SHALL assign the user a media mode of `audio`.
4. WHEN `getUserMedia` fails entirely or returns a stream with no tracks, THE ChatRoom SHALL assign the user a media mode of `text`.
5. WHEN a user selects text-only chat mode before joining, THE ChatRoom SHALL assign the user a media mode of `text` without calling `getUserMedia`.

---

### Requirement 2

**User Story:** As a matched user, I want to know what media mode my partner is in, so that I understand what kind of interaction to expect.

#### Acceptance Criteria

1. WHEN a match is found, THE Signaling Server SHALL include each user's media mode in the `match_found` event payload delivered to both users.
2. WHEN the `find_match` event is emitted by a client, THE Signaling Server SHALL accept and store the `mediaMode` field from the event payload.
3. WHEN a match is created between two users, THE Signaling Server SHALL relay each user's stored `mediaMode` to the other user as `partnerMediaMode` in the `match_found` payload.
4. WHEN a user's media mode is determined on the client, THE ChatRoom SHALL emit the `mediaMode` field as part of the `find_match` event payload sent to the Signaling Server.

---

### Requirement 3

**User Story:** As a matched user, I want to see a clear, non-intrusive indicator of my partner's media mode, so that I am not confused by a black screen or missing video.

#### Acceptance Criteria

1. WHEN the partner's media mode is `text`, THE ChatRoom SHALL display a mode indicator reading "💬 Text only — they don't have a camera" in the main video area.
2. WHEN the partner's media mode is `audio`, THE ChatRoom SHALL display a mode indicator reading "🎤 Voice only" in the main video area.
3. WHEN the partner's media mode is `video`, THE ChatRoom SHALL display no additional mode indicator in the main video area.
4. WHEN the partner's media mode is `text` or `audio`, THE ChatRoom SHALL render a styled placeholder element in place of the partner video element.
5. WHILE a mode indicator is displayed, THE ChatRoom SHALL render it in a position that does not obstruct the text chat input or message history.

---

### Requirement 4

**User Story:** As a user without a camera, I want to see a clear placeholder where my own video would appear, so that I know the app is working correctly.

#### Acceptance Criteria

1. WHEN the local user's media mode is `audio` or `text`, THE ChatRoom SHALL render a styled placeholder in the local video corner instead of a video element.
2. WHEN the local user's media mode is `audio` or `text`, THE ChatRoom SHALL display a camera-off icon inside the local video placeholder.
3. WHEN the local user's media mode is `video` and the user toggles the camera off mid-session, THE ChatRoom SHALL apply a dark overlay to the local video element to indicate camera is disabled.

---

### Requirement 5

**User Story:** As a user in a mixed-mode match, I want WebRTC to connect gracefully based on what media is available, so that audio and text still work even when video is not possible.

#### Acceptance Criteria

1. WHEN both users have a media mode of `video`, THE ChatRoom SHALL establish a full WebRTC PeerConnection with video and audio tracks.
2. WHEN the local user's media mode is `audio`, THE ChatRoom SHALL add only the audio track to the PeerConnection offer.
3. WHEN the local user's media mode is `text`, THE ChatRoom SHALL skip WebRTC negotiation entirely and rely on Socket.io text messaging only.
4. WHEN both users have a media mode of `text`, THE ChatRoom SHALL skip WebRTC negotiation entirely and use Socket.io text messaging only.
5. IF a WebRTC operation throws an error during negotiation, THEN THE ChatRoom SHALL catch the error, log it to the console, and continue the session in text-only mode without displaying an uncaught exception to the user.

---

### Requirement 6

**User Story:** As a user in any media mode combination, I want text chat to work reliably, so that I can always communicate with my partner regardless of video or audio availability.

#### Acceptance Criteria

1. WHILE two users are matched with any combination of media modes, THE ChatRoom SHALL allow both users to send and receive text messages via Socket.io.
2. WHEN a user sends a text message, THE Signaling Server SHALL deliver the message to the partner only if the sender is in an active pair with that partner.
3. WHEN a user is in `text` media mode and is matched, THE ChatRoom SHALL display the full text chat UI including message history, input field, and send button.
4. WHEN a user is in `audio` or `video` media mode and is matched, THE ChatRoom SHALL display the text chat input overlay on top of the video area.
