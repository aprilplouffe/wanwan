// Types for WanWan React Application

export type RoleType = 'char' | 'npc' | 'user';

export interface Character {
  id?: number;
  type: RoleType;
  name: string;
  avatar?: string;
  bio?: string;
  group?: string;
  prompt?: string;
  greeting?: string;
  tags?: string[];
  tone?: string;
  timezone?: string;
}

export interface ChatSession {
  id?: number;
  charId: number;
  ownerUid?: number;
  lastMessage?: string;
  updatedAt?: number;
  unread?: number;
}

export type MessageType = 'text' | 'image' | 'voice' | 'redpacket' | 'system';

export interface ChatMessage {
  id?: number;
  chatId: number;
  sender: 'user' | 'char' | 'system';
  content: string;
  createdAt: number;
  type?: MessageType;
  meta?: {
    duration?: number; // for voice
    url?: string;      // for image
    amount?: string;   // for red packet
    note?: string;
    isOpened?: boolean;
    translation?: string;
  };
}

export interface MomentComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: number;
}

export interface Moment {
  id?: number;
  charId: number;
  ownerUid?: number;
  authorName: string;
  avatar?: string;
  content: string;
  images?: string[];
  likes?: string[]; // array of names
  comments?: MomentComment[];
  createdAt: number;
}

export interface LorebookEntry {
  id?: number;
  key: string;
  triggers: string[];
  content: string;
  enabled: boolean;
  priority?: number;
}

export interface MemoryItem {
  id?: number;
  ownerUid?: number;
  charId: number;
  chatId?: number;
  title: string;
  content: string;
  tags?: string[];
  createdAt: number;
}

export interface CallRecord {
  id?: number;
  charId: number;
  charName: string;
  avatar?: string;
  type: 'incoming' | 'outgoing' | 'missed';
  duration: number; // in seconds
  createdAt: number;
}

export interface SMSMessage {
  id?: number;
  conversationId: number;
  sender: 'user' | 'remote';
  content: string;
  createdAt: number;
}

export interface SMSConversation {
  id?: number;
  ownerPhone: string;
  remotePhone: string;
  remoteName: string;
  avatar?: string;
  updatedAt: number;
  lastMessage?: string;
}

export interface Transaction {
  id?: number;
  type: 'expense' | 'income';
  amount: number;
  category: string;
  note?: string;
  createdAt: number;
}

export interface AvgSave {
  id?: number;
  gameId: string;
  slot: number;
  data: any;
  updatedAt: number;
}

export interface DesktopWidget {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  cols: number;
  rows: number;
  data: any;
}

export interface AppSettings {
  apiProvider: string;
  apiBaseUrl: string;
  apiKey: string;
  apiModel: string;
  temperature: number;
  keepAliveEnabled: boolean;
  theme: 'light' | 'dark';
  desktopLabelColor: string;
  wallpaperData: string;
  appIconPreset: string;
}

export type PageId =
  | 'home'
  | 'wechat'
  | 'character'
  | 'lorebook'
  | 'phone'
  | 'music'
  | 'icity'
  | 'x'
  | 'instagram'
  | 'miss-you'
  | 'memory'
  | 'wallet'
  | 'taobao'
  | 'bookstore'
  | 'yumyum'
  | 'anyDoor'
  | 'gameHall'
  | 'avg'
  | 'terminal'
  | 'settings'
  | 'tutorial'
  | 'iscreens'
  | 'message';
