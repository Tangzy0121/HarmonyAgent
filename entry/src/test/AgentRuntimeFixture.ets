export const AGENT_EVENTS_V1_SSE: string =
  'id: 1\nevent: turn_started\ndata: {"version":"1","turnId":"turn-fixture-1","eventId":"1","timestamp":"2026-08-14T00:00:00.000Z","idempotencyKey":"turn-fixture-1:started","type":"turn_started","payload":{"capability":"guided_learning"}}\n\n' +
  'id: 2\nevent: activity\ndata: {"version":"1","turnId":"turn-fixture-1","eventId":"2","timestamp":"2026-08-14T00:00:01.000Z","idempotencyKey":"turn-fixture-1:activity:grounding","type":"activity","payload":{"label":"正在核对章节依据"}}\n\n' +
  'id: 3\nevent: content_delta\ndata: {"version":"1","turnId":"turn-fixture-1","eventId":"3","timestamp":"2026-08-14T00:00:02.000Z","idempotencyKey":"turn-fixture-1:delta:1","type":"content_delta","payload":{"text":"监督学习使用带标签样本。"}}\n\n' +
  'id: 4\nevent: citation\ndata: {"version":"1","turnId":"turn-fixture-1","eventId":"4","timestamp":"2026-08-14T00:00:03.000Z","idempotencyKey":"turn-fixture-1:citation:S1","type":"citation","payload":{"sourceId":"S1","fileName":"lecture.pdf","pageRange":"4-5"}}\n\n' +
  'id: 5\nevent: turn_completed\ndata: {"version":"1","turnId":"turn-fixture-1","eventId":"5","timestamp":"2026-08-14T00:00:04.000Z","idempotencyKey":"turn-fixture-1:completed","type":"turn_completed","payload":{"status":"completed"}}\n\n'

export const USER_QUESTION_EVENT: string =
  '{"version":"1","turnId":"turn-question","eventId":"2","timestamp":"2026-08-14T00:00:01.000Z",' +
  '"idempotencyKey":"turn-question:question:chapter","type":"user_question","payload":{' +
  '"questionId":"turn-question:chapter","prompt":"请选择章节","options":["chapter-1","chapter-2"],' +
  '"allowFreeText":true}}'
