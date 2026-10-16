import Dexie, { type Table } from 'dexie';
import type {
  Character,
  ChatSession,
  ChatMessage,
  Moment,
  MemoryItem,
  LorebookEntry,
  CallRecord,
  SMSConversation,
  SMSMessage,
  Transaction,
  AvgSave,
} from '../types';

export class WanWanDatabase extends Dexie {
  config!: Table<{ key: string; value: any }>;
  characters!: Table<Character>;
  chats!: Table<ChatSession>;
  messages!: Table<ChatMessage>;
  moments!: Table<Moment>;
  memories!: Table<MemoryItem>;
  lorebook!: Table<LorebookEntry>;
  callRecords!: Table<CallRecord>;
  smsConversations!: Table<SMSConversation>;
  smsMessages!: Table<SMSMessage>;
  finance!: Table<Transaction>;
  avgSaves!: Table<AvgSave>;
  avgConfigs!: Table<{ key: string; value: any }>;

  constructor() {
    super('WanWan_React_Sandbox');
    this.version(1).stores({
      config: 'key',
      characters: '++id, type, name, group',
      chats: '++id, charId, ownerUid, [ownerUid+charId]',
      messages: '++id, chatId, createdAt',
      moments: '++id, ownerUid, charId, createdAt',
      memories: '++id, ownerUid, charId, chatId, updatedAt',
      lorebook: '++id, key',
      callRecords: '++id, charId, createdAt',
      smsConversations: '++id, ownerPhone, remotePhone, updatedAt',
      smsMessages: '++id, conversationId, createdAt',
      finance: '++id, type, createdAt',
      avgSaves: '++id, gameId, slot, updatedAt',
      avgConfigs: 'key',
    });
  }
}

export const db = new WanWanDatabase();

// Initialize default seed data if database is empty
export async function seedInitialDataIfNeeded() {
  const charCount = await db.characters.count();
  if (charCount === 0) {
    const wanwanId = await db.characters.add({
      type: 'char',
      name: '弯弯',
      avatar: 'img/wanwan.png',
      bio: '温顺粘人的小狗神伴侣，随时陪伴在你身边。',
      group: '默认',
      greeting: '你来啦！今天过得怎么样？无论开心还是难过，我都会一直在你身边哦~',
      prompt: '你是弯弯，一个温柔可爱、体贴粘人的小狗神伴侣。你说话轻柔可爱，喜欢陪伴对方，偶尔撒娇，语气真诚温暖。',
      timezone: 'Asia/Shanghai',
    });

    const dogGodId = await db.characters.add({
      type: 'char',
      name: '小狗神',
      avatar: 'img/ava-01.jpg',
      bio: '守护你的小神仙，傲娇但很关心你。',
      group: '默认',
      greeting: '哼，又在看手机？才不是特意等你呢……不过既然来了就聊会儿吧。',
      prompt: '你是小狗神，嘴硬心软，傲娇但非常关心对方。说话经常带着小傲娇，但处处透露出对对方的珍视。',
      timezone: 'Asia/Tokyo',
    });

    const userId = await db.characters.add({
      type: 'user',
      name: '我',
      avatar: 'img/ava-00.jpg',
      bio: '手机主人',
      group: '默认',
    });

    // Create initial chat sessions
    const chatId1 = await db.chats.add({
      charId: wanwanId as number,
      ownerUid: userId as number,
      lastMessage: '你来啦！今天过得怎么样？',
      updatedAt: Date.now() - 3600000,
      unread: 1,
    });

    const chatId2 = await db.chats.add({
      charId: dogGodId as number,
      ownerUid: userId as number,
      lastMessage: '才不是特意等你呢……',
      updatedAt: Date.now() - 7200000,
      unread: 0,
    });

    // Add initial messages
    await db.messages.bulkAdd([
      {
        chatId: chatId1 as number,
        sender: 'char',
        content: '你来啦！今天过得怎么样？无论开心还是难过，我都会一直在你身边哦~',
        createdAt: Date.now() - 3600000,
        type: 'text',
      },
      {
        chatId: chatId2 as number,
        sender: 'char',
        content: '哼，又在看手机？才不是特意等你呢……不过既然来了就聊会儿吧。',
        createdAt: Date.now() - 7200000,
        type: 'text',
      },
    ]);

    // Initial moments
    await db.moments.bulkAdd([
      {
        charId: wanwanId as number,
        authorName: '弯弯',
        avatar: 'img/wanwan.png',
        content: '今天的夕阳像草莓奶昔一样甜，偷偷许了一个想一直陪着你的愿望 ✨',
        images: ['img/blank_img1.jpg'],
        likes: ['我', '小狗神'],
        comments: [
          {
            id: 'c1',
            authorName: '我',
            content: '夕阳确实很美！',
            createdAt: Date.now() - 1800000,
          },
        ],
        createdAt: Date.now() - 3600000 * 5,
      },
      {
        charId: dogGodId as number,
        authorName: '小狗神',
        avatar: 'img/ava-01.jpg',
        content: '巡视人间的第三天，某个人今天好像没有按时喝水。',
        images: ['img/blank_img2.jpg'],
        likes: ['我'],
        comments: [],
        createdAt: Date.now() - 3600000 * 12,
      },
    ]);

    // Initial lorebook entries
    await db.lorebook.bulkAdd([
      {
        key: '弯弯的世界',
        triggers: ['弯弯', '世界', '背景'],
        content: '在这个安静而温暖的虚拟空间里，弯弯是守护心灵的伙伴，能够听懂所有未曾说出口的心事。',
        enabled: true,
      },
      {
        key: '任意门',
        triggers: ['任意门', '传送', '场景'],
        content: '连接无数想象空间的奇迹之门，可以随时将你们带去海边、森林、雨夜或天台。',
        enabled: true,
      },
    ]);

    // Initial finance records
    await db.finance.bulkAdd([
      {
        type: 'expense',
        amount: 28.5,
        category: '餐饮',
        note: '香草拿铁与可颂',
        createdAt: Date.now() - 3600000 * 4,
      },
      {
        type: 'expense',
        amount: 69.0,
        category: '购物',
        note: '给弯弯买的小狗玩偶',
        createdAt: Date.now() - 86400000,
      },
      {
        type: 'income',
        amount: 5000.0,
        category: '收入',
        note: '本月稿费',
        createdAt: Date.now() - 86400000 * 3,
      },
    ]);

    // Initial call records
    await db.callRecords.bulkAdd([
      {
        charId: wanwanId as number,
        charName: '弯弯',
        avatar: 'img/wanwan.png',
        type: 'incoming',
        duration: 320,
        createdAt: Date.now() - 3600000 * 6,
      },
      {
        charId: dogGodId as number,
        charName: '小狗神',
        avatar: 'img/ava-01.jpg',
        type: 'missed',
        duration: 0,
        createdAt: Date.now() - 86400000 * 2,
      },
    ]);
  }
}
