import {
  BookOpen,
  Dumbbell,
  GraduationCap,
  Languages,
  HeartHandshake,
  Sparkles,
  Target,
} from 'lucide-react';
export function goalCover(type: string) {
  if (type === 'quran') return '/art/goal-quran.png';
  if (type === 'sport') return '/art/goal-sport.png';
  if (type === 'language') return '/art/goal-language.png';
  if (['study', 'reading', 'memorization'].includes(type)) return '/art/goal-study.png';
  return '/art/sanctuary.png';
}
export function goalIcon(type: string) {
  if (['quran', 'reading', 'memorization'].includes(type)) return BookOpen;
  if (type === 'sport') return Dumbbell;
  if (type === 'language') return Languages;
  if (type === 'study') return GraduationCap;
  if (type === 'solidarity') return HeartHandshake;
  if (type === 'creation') return Sparkles;
  return Target;
}
