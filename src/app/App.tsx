import { CoachPage } from '@/features/coach/CoachPage';
import { PeoplePage } from '@/features/people/PeoplePage';
import { LearningHub } from '@/features/learning/LearningHub';
import { NotesPage } from '@/features/workspaces/NotesPage';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
import { Layout } from './layout/Layout';
import { TodayPage } from '@/features/execution/TodayPage';
import { InboxPage } from '@/features/execution/InboxPage';
import { AreasPage } from '@/features/areas/AreasPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { FocusPage } from '@/features/focus/FocusPage';
import { HabitsPage } from '@/features/habits/HabitsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { ReviewsPage } from '@/features/reviews/ReviewsPage';
import { ArchivePage } from '@/features/archive/ArchivePage';
import { HomePage } from '@/features/home/HomePage';
import { LearningPage } from '@/features/learning/LearningPage';
import { QuranPage } from '@/features/spiritual/QuranPage';
import { AdhkarPage } from '@/features/spiritual/AdhkarPage';
import { SunnahPage } from '@/features/spiritual/SunnahPage';

export function App() {
  return (
    <ThemeProvider>
      <DatabaseProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/quran" element={<QuranPage />} />
              <Route path="/adhkar" element={<AdhkarPage />} />
              <Route path="/sunnah" element={<SunnahPage />} />
              <Route path="/learn" element={<LearningHub />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/learn/:section" element={<LearningPage />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/areas" element={<AreasPage />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/goals/:id" element={<GoalsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/coach" element={<CoachPage />} />
              <Route path="/companions" element={<PeoplePage />} />
              <Route path="/scholars" element={<PeoplePage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/archive" element={<ArchivePage />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
