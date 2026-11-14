'use strict';
// 공용 테스트 픽스처
function makeDb() {
  const students = [
    { email: 'a@ai.jbedu.kr', name: '가학생', classNo: 2, number: 1, career: '의약·보건', joinedAt: 't' },
    { email: 'b@ai.jbedu.kr', name: '나학생', classNo: 1, number: 9, career: '의약·보건', joinedAt: 't' },
    { email: 'c@ai.jbedu.kr', name: '다학생', classNo: 1, number: 3, career: '교육', joinedAt: 't' },
    { email: 'd@ai.jbedu.kr', name: '라학생', classNo: 3, number: 2, career: '공학·IT', joinedAt: 't' },
  ];
  const books = [
    { id: 'P01', title: '코스모스', author: '칼 세이건', kind: '봉우리', careers: ['자연과학'], peakId: '', intro: '', source: '서울대 권장도서 100선' },
    { id: 'B01', title: '과학콘서트', author: '정재승', kind: '징검다리', careers: ['자연과학'], peakId: 'P01', intro: '', source: '' },
    { id: 'U-1', title: '내가 넣은 책', author: '누군가', kind: '학생추가', careers: ['교육'], peakId: '', intro: '', source: '' },
  ];
  const essays = [
    { id: 'E1', email: 'a@ai.jbedu.kr', bookId: 'B01', body: '본문1', recTarget: 't1', recReason: '이유1', question: '질문1', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '', hidden: false },
    { id: 'E2', email: 'c@ai.jbedu.kr', bookId: 'B01', body: '본문2', recTarget: 't2', recReason: '이유2', question: '', createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '', hidden: false },
    { id: 'E3', email: 'd@ai.jbedu.kr', bookId: 'P01', body: '본문3', recTarget: 't3', recReason: '이유3', question: '', createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '', hidden: false },
    { id: 'E4', email: 'b@ai.jbedu.kr', bookId: 'P01', body: '숨김본문', recTarget: 't4', recReason: '숨김이유', question: '', createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '', hidden: true },
  ];
  const comments = [
    { id: 'C1', essayId: 'E1', email: 'c@ai.jbedu.kr', body: '댓글1', createdAt: '2026-11-02T00:00:00.000Z', hidden: false },
    { id: 'C2', essayId: 'E1', email: 'd@ai.jbedu.kr', body: '숨김댓글', createdAt: '2026-11-03T00:00:00.000Z', hidden: true },
    { id: 'C3', essayId: 'E4', email: 'a@ai.jbedu.kr', body: '숨김글댓글', createdAt: '2026-11-06T00:00:00.000Z', hidden: false },
  ];
  return { students, books, essays, comments };
}
module.exports = { makeDb };
