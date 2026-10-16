import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Character, AppSettings, PageId } from '../types';
import { db, seedInitialDataIfNeeded } from '../db';

interface ToastItem {
  id: number;
  message: string;
}

interface AppContextType {
  activePage: PageId | null;
  pageStack: PageId[];
  openPage: (page: PageId) => void;
  closePage: (targetPage?: PageId) => void;
  characters: Character[];
  currentUser: Character | null;
  setCurrentUser: (user: Character) => void;
  refreshCharacters: () => Promise<void>;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  wallpaper: string;
  setWallpaper: (wp: string) => void;
  toast: (msg: string) => void;
  toasts: ToastItem[];
  pickImage: (callback: (url: string) => void) => void;
  imagePickerOpen: boolean;
  closeImagePicker: () => void;
  onImageSelected: (url: string) => void;
  disclaimerVisible: boolean;
  confirmDisclaimer: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  apiProvider: 'gemini',
  apiBaseUrl: 'https://generativelanguage.googleapis.com',
  apiKey: '',
  apiModel: 'gemini-1.5-flash',
  temperature: 0.8,
  keepAliveEnabled: false,
  theme: 'light',
  desktopLabelColor: '#3a3a3a',
  wallpaperData: '',
  appIconPreset: 'wanwan',
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<PageId | null>(null);
  const [pageStack, setPageStack] = useState<PageId[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [currentUser, setCurrentUser] = useState<Character | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [wallpaper, setWallpaperState] = useState<string>('');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerCallback, setImagePickerCallback] = useState<((url: string) => void) | null>(null);
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);

  // Toast helper
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message: msg }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }, []);

  // Image picker helper
  const pickImage = useCallback((callback: (url: string) => void) => {
    setImagePickerCallback(() => callback);
    setImagePickerOpen(true);
  }, []);

  const closeImagePicker = useCallback(() => {
    setImagePickerOpen(false);
    setImagePickerCallback(null);
  }, []);

  const onImageSelected = useCallback(
    (url: string) => {
      if (imagePickerCallback) {
        imagePickerCallback(url);
      }
      closeImagePicker();
    },
    [imagePickerCallback, closeImagePicker]
  );

  // Navigation
  const openPage = useCallback((page: PageId) => {
    setActivePage(page);
    setPageStack((prev) => [...prev, page]);
  }, []);

  const closePage = useCallback((_targetPage?: PageId) => {
    setPageStack((prev) => {
      if (prev.length <= 1) {
        setActivePage(null);
        return [];
      }
      const next = prev.slice(0, prev.length - 1);
      setActivePage(next[next.length - 1]);
      return next;
    });
  }, []);

  // Refresh characters from Dexie
  const refreshCharacters = useCallback(async () => {
    const list = await db.characters.toArray();
    setCharacters(list);
    const user = list.find((c) => c.type === 'user');
    if (user) {
      setCurrentUser((prev) => prev || user);
    }
  }, []);

  // Update Settings
  const updateSettings = useCallback(
    async (newSettings: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        db.config.put({ key: 'appSettings', value: next }).catch(console.error);
        return next;
      });
      if (newSettings.wallpaperData !== undefined) {
        setWallpaperState(newSettings.wallpaperData);
        db.config.put({ key: 'wallpaperData', value: newSettings.wallpaperData }).catch(console.error);
      }
    },
    []
  );

  const setWallpaper = useCallback((wp: string) => {
    setWallpaperState(wp);
    db.config.put({ key: 'wallpaperData', value: wp }).catch(console.error);
  }, []);

  const confirmDisclaimer = useCallback(() => {
    try {
      localStorage.setItem('wanwan_disclaimer_confirmed', 'true');
    } catch (_) {}
    setDisclaimerVisible(false);
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      await seedInitialDataIfNeeded();
      await refreshCharacters();

      try {
        const hasConfirmed = localStorage.getItem('wanwan_disclaimer_confirmed');
        if (!hasConfirmed) {
          setDisclaimerVisible(true);
        }
      } catch (_) {}

      try {
        const savedSettings = await db.config.get('appSettings');
        if (savedSettings && savedSettings.value) {
          setSettings((prev) => ({ ...prev, ...savedSettings.value }));
        }
        const savedWp = await db.config.get('wallpaperData');
        if (savedWp && savedWp.value) {
          setWallpaperState(savedWp.value);
        }
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
    init();
  }, [refreshCharacters]);

  return (
    <AppContext.Provider
      value={{
        activePage,
        pageStack,
        openPage,
        closePage,
        characters,
        currentUser,
        setCurrentUser,
        refreshCharacters,
        settings,
        updateSettings,
        wallpaper,
        setWallpaper,
        toast,
        toasts,
        pickImage,
        imagePickerOpen,
        closeImagePicker,
        onImageSelected,
        disclaimerVisible,
        confirmDisclaimer,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
