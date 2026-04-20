# Implementation Plan

- [ ] 1. Extract and implement the `detectMediaMode` pure function
  - Create `client/src/utils/mediaMode.js` exporting `detectMediaMode(stream)` that returns `'video'`, `'audio'`, or `'text'` based on the stream's track list
  - Handle null/undefined stream as `'text'`
  - _Requirements: 1.2, 1.3, 1.4_

- [ ] 1.1 Write property-based test for `detectMediaMode`
  - **Property 1: Media mode detection from stream tracks**
  - Use fast-check to generate random combinations of video/audio/no-track mock streams and assert the correct mode is returned
  - **Validates: Requirements 1.2, 1.3, 1.4**

- [ ] 2. Update the signaling server to store and relay `mediaMode`
  - In `server/index.js`, read `mediaMode` from the `find_match` payload and persist it in `userMeta` (default to `'text'` if absent or invalid)
  - In the match dispatch block, read each user's stored `mediaMode` and include it as `partnerMediaMode` in the `match_found` payload sent to each user
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2.1 Write property-based test for symmetric mode relay
  - **Property 2: Partner mode is relayed symmetrically on match**
  - Use fast-check to generate random pairs of media modes, simulate the server match logic, and assert each user receives the other's mode
  - **Validates: Requirements 2.1, 2.3**

- [ ] 3. Update `ChatRoom.jsx` — media acquisition with three-tier fallback
  - Add `myMediaMode` and `partnerMediaMode` state variables
  - Replace the current hard-fail `getUserMedia` call in `initializeMediaAndSocket` with the three-tier fallback: video+audio → audio-only → text
  - After mode is determined, include `mediaMode` in the `find_match` emit
  - In the `match_found` socket handler, set `partnerMediaMode` from the payload (default `'text'`)
  - Remove the `cam_error` status path — it is replaced by graceful fallback
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.4_

- [ ] 4. Update `ChatRoom.jsx` — conditional WebRTC track selection
  - In `createPC`, only add tracks that match `myMediaMode`: all tracks for `'video'`, audio-only for `'audio'`
  - In `startPC` / `match_found` handler, skip `createPC` and `startPC` entirely when `myMediaMode === 'text'`
  - Wrap all WebRTC operations (`createOffer`, `setLocalDescription`, `setRemoteDescription`, `createAnswer`, `addIceCandidate`) in try/catch; on error, log to console and continue in text-only mode
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 4.1 Write property-based test for PeerConnection track selection
  - **Property 6: PeerConnection tracks match local media mode**
  - Use fast-check to generate random streams and modes, call the track-addition logic against a mock PeerConnection, and assert the correct tracks were added
  - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 5. Add `PartnerPlaceholder`, `LocalPlaceholder`, and `ModeIndicator` UI components to `ChatRoom.jsx`
  - `PartnerPlaceholder`: full-area dark box shown when `partnerMediaMode !== 'video'`; contains `ModeIndicator`
  - `ModeIndicator`: badge showing "💬 Text only — they don't have a camera" or "🎤 Voice only" based on `partnerMediaMode`
  - `LocalPlaceholder`: small PiP-corner dark box with a camera-off icon shown when `myMediaMode !== 'video'`
  - Render `PartnerPlaceholder` in place of the partner `<video>` element when applicable
  - Render `LocalPlaceholder` in place of the local `<video>` element when applicable
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_

- [ ] 5.1 Write property-based test for partner mode indicator rendering
  - **Property 3: Partner mode indicator renders correct text**
  - Use fast-check to generate random connected states with each `partnerMediaMode` value, render the component, and assert the correct indicator text is present or absent
  - **Validates: Requirements 3.1, 3.2, 3.3**

- [ ] 5.2 Write property-based test for partner placeholder rendering
  - **Property 4: Non-video partner mode renders a placeholder**
  - Use fast-check to generate random connected states with `partnerMediaMode` in `['text', 'audio']`, render, and assert the placeholder element is present
  - **Validates: Requirements 3.4**

- [ ] 5.3 Write property-based test for local placeholder rendering
  - **Property 5: Local placeholder shown when no camera**
  - Use fast-check to generate random connected states with `myMediaMode` in `['text', 'audio']`, render, and assert the local placeholder with camera-off icon is present
  - **Validates: Requirements 4.1, 4.2**

- [ ] 5.4 Write property-based test for text chat UI availability
  - **Property 7: Text chat UI is always present when matched**
  - Use fast-check to generate random matched states with any combination of `myMediaMode` and `partnerMediaMode`, render, and assert the text input and send button are present
  - **Validates: Requirements 6.1, 6.3, 6.4**

- [ ] 6. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Verify text chat works in all mode combinations (integration smoke test)
  - Write an integration test that simulates the full Socket.io message flow for each of the four key mode combinations: video/video, video/text, text/text, audio/video
  - Assert that `send_message` and `receive_message` events are delivered correctly in all cases
  - _Requirements: 6.1, 6.2_

- [ ] 8. Final Checkpoint — Ensure all tests pass, ask the user if questions arise.
