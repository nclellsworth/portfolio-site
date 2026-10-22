import {dateLabel, el} from './client.js';

export function isUpcomingLesson(lesson, now = Date.now()) {
  return lesson.status === 'scheduled' && new Date(lesson.starts_at).getTime() > now;
}

export function renderStudentLessons(lessons, upcomingList, pastList) {
  const now = Date.now();
  upcomingList.replaceChildren();
  pastList.replaceChildren();
  const upcoming = lessons.filter(item => isUpcomingLesson(item, now))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const history = lessons.filter(item => !isUpcomingLesson(item, now))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

  for (const item of upcoming) {
    const li = el('li');
    li.append(el('strong', dateLabel(item.starts_at) + ' · Upcoming'),
      el('div', item.summary || 'Art lesson', 'muted'));
    upcomingList.append(li);
  }
  if (!upcoming.length) upcomingList.append(el('li', 'No upcoming sessions.', 'muted'));

  for (const item of history) {
    const li = el('li');
    const label = item.status === 'cancelled' ? 'Cancelled' :
      new Date(item.starts_at).getTime() > now ? 'Completed' : 'Past';
    li.append(el('span', dateLabel(item.starts_at) + ' · ' + label, 'lesson-past-date'),
      el('div', item.summary || 'Art lesson', 'muted'));
    pastList.append(li);
  }
  if (!history.length) pastList.append(el('li', 'No past sessions yet.', 'muted'));
}
