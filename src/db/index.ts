import { Capacitor } from '@capacitor/core';
import type { SongRepository } from './types';
import { DemoRepository } from './demo';
import { NativeRepository } from './native';

let repositoryPromise: Promise<SongRepository> | null = null;

/** В браузере — демо-данные, в приложении — нативная SQLite */
export function getRepository(): Promise<SongRepository> {
  repositoryPromise ??= (async () => {
    const repository: SongRepository = Capacitor.isNativePlatform()
      ? new NativeRepository()
      : new DemoRepository();
    await repository.ready();
    return repository;
  })();

  return repositoryPromise;
}
