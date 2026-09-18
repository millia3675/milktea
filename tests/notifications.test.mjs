import test from 'node:test';
import assert from 'node:assert/strict';
import { commentRecipients, notificationPreview } from '../src/notification-data.js';
const entry = { id: 'diary', author_id: 'owner', status: 'published' };
test('알림: 내 일기의 친구 댓글만 받으며 내 댓글·초안은 제외한다', () => {
  assert.deepEqual(commentRecipients({author_id:'friend'},entry), [{recipient_id:'owner',kind:'entry_comment'}]);
  assert.deepEqual(commentRecipients({author_id:'owner'},entry), []);
  assert.deepEqual(commentRecipients({author_id:'friend'},{...entry,status:'draft'}), []);
});
test('알림: 답글 대상과 일기 주인이 다르면 각각, 같으면 답글 알림 하나만 만든다', () => {
  assert.deepEqual(commentRecipients({author_id:'writer'},entry,{entry_id:'diary',author_id:'parent'}), [
    {recipient_id:'parent',kind:'comment_reply'}, {recipient_id:'owner',kind:'entry_comment'},
  ]);
  assert.deepEqual(commentRecipients({author_id:'writer'},entry,{entry_id:'diary',author_id:'owner'}), [{recipient_id:'owner',kind:'comment_reply'}]);
});
test('알림: 본인에게 단 답글과 다른 일기의 부모 댓글을 제외한다', () => {
  for (const parent of [{entry_id:'diary',author_id:'writer'},{entry_id:'other',author_id:'parent'}])
    assert.deepEqual(commentRecipients({author_id:'writer'},entry,parent), [{recipient_id:'owner',kind:'entry_comment'}]);
});
test('알림: 사진 댓글과 긴 본문 미리보기를 표시하고 마크업은 텍스트로 넘긴다', () => {
  assert.equal(notificationPreview({content:'',image_asset_id:'photo'}),'사진을 남겼어요.');
  assert.equal(notificationPreview({content:'  첫째\n둘째  '}),'첫째 둘째');
  assert.equal(notificationPreview({content:'가'.repeat(161)}),'가'.repeat(160)+'…');
  assert.equal(notificationPreview({content:'<img onerror=alert(1)>'}),'<img onerror=alert(1)>');
});
