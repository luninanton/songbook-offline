import type { Song } from '../core/types';

/**
 * Свои песни хранятся ещё и в localStorage — независимо от файла базы.
 *
 * Причина: при обновлении приложения схема базы может измениться, и MainActivity
 * переустанавливает songs.db из APK. Без этой копии введённые вручную песни
 * были бы потеряны. При старте приложение досылает их обратно в базу.
 */
const KEY = 'hc.userSongs.v1';

export function loadUserSongs(): Song[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Song[];
    return Array.isArray(parsed) ? parsed.filter((song) => typeof song?.id === 'number') : [];
  } catch {
    return [];
  }
}

export function saveUserSongs(songs: Song[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(songs));
  } catch {
    // переполнение хранилища — песня останется только в базе
  }
}

export function upsertUserSong(song: Song): Song[] {
  const songs = loadUserSongs();
  const index = songs.findIndex((item) => item.id === song.id);
  if (index >= 0) songs[index] = song;
  else songs.push(song);
  saveUserSongs(songs);
  return songs;
}

export function removeUserSong(id: number): void {
  saveUserSongs(loadUserSongs().filter((song) => song.id !== id));
}
