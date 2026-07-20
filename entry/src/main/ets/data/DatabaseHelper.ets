// DatabaseHelper —— SQLite 数据库初始化与管理
// 实现技术实施计划 §2 数据层的 10 张表 DDL
// 使用 @ohos.data.relationalStore (RdbStore)
//
// 表清单：
//   note          —— 笔记/文件元数据
//   chunk         —— 文本分块
//   embedding     —— 向量嵌入 (Float32 BLOB)
//   note_link     —— 笔记间关联
//   knowledge_point —— 知识点
//   chunk_kp      —— 分块-知识点关联
//   kp_mastery    —— 知识点掌握度（学习模型核心）
//   review_event  —— 复习事件记录
//   behavior_log  —— 用户行为日志
//   push_record   —— 推送记录（防骚扰）

import { relationalStore } from '@kit.data.relationalStore';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';

const TAG: string = 'DatabaseHelper';

let rdbStore: relationalStore.RdbStore | null = null;

// ── DDL ──

const DDL_NOTE: string =
  'CREATE TABLE IF NOT EXISTS note (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  title TEXT NOT NULL, ' +
  '  source_type TEXT, ' +
  '  source_url TEXT, ' +
  '  raw_text TEXT, ' +
  '  created_at INTEGER, ' +
  '  updated_at INTEGER' +
  ')';

const DDL_CHUNK: string =
  'CREATE TABLE IF NOT EXISTS chunk (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  note_id INTEGER NOT NULL, ' +
  '  content TEXT NOT NULL, ' +
  '  chunk_index INTEGER, ' +
  '  created_at INTEGER, ' +
  '  FOREIGN KEY (note_id) REFERENCES note(id) ON DELETE CASCADE' +
  ')';

const DDL_EMBEDDING: string =
  'CREATE TABLE IF NOT EXISTS embedding (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  chunk_id INTEGER NOT NULL UNIQUE, ' +
  '  vector BLOB NOT NULL, ' +
  '  model_name TEXT, ' +
  '  dim INTEGER, ' +
  '  created_at INTEGER, ' +
  '  FOREIGN KEY (chunk_id) REFERENCES chunk(id) ON DELETE CASCADE' +
  ')';

const DDL_NOTE_LINK: string =
  'CREATE TABLE IF NOT EXISTS note_link (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  source_note_id INTEGER NOT NULL, ' +
  '  target_note_id INTEGER NOT NULL, ' +
  '  link_type TEXT, ' +
  '  FOREIGN KEY (source_note_id) REFERENCES note(id) ON DELETE CASCADE, ' +
  '  FOREIGN KEY (target_note_id) REFERENCES note(id) ON DELETE CASCADE' +
  ')';

const DDL_KNOWLEDGE_POINT: string =
  'CREATE TABLE IF NOT EXISTS knowledge_point (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  name TEXT NOT NULL, ' +
  '  description TEXT, ' +
  '  domain TEXT, ' +
  '  created_at INTEGER' +
  ')';

const DDL_CHUNK_KP: string =
  'CREATE TABLE IF NOT EXISTS chunk_kp (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  chunk_id INTEGER NOT NULL, ' +
  '  kp_id INTEGER NOT NULL, ' +
  '  relevance REAL DEFAULT 0.5, ' +
  '  FOREIGN KEY (chunk_id) REFERENCES chunk(id) ON DELETE CASCADE, ' +
  '  FOREIGN KEY (kp_id) REFERENCES knowledge_point(id) ON DELETE CASCADE' +
  ')';

const DDL_KP_MASTERY: string =
  'CREATE TABLE IF NOT EXISTS kp_mastery (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  kp_id INTEGER NOT NULL UNIQUE, ' +
  '  mastery_level REAL DEFAULT 0.0, ' +
  '  stability REAL DEFAULT 1.0, ' +
  '  last_review_at INTEGER, ' +
  '  next_review_at INTEGER, ' +
  '  review_count INTEGER DEFAULT 0, ' +
  '  ease_factor REAL DEFAULT 2.5, ' +
  '  FOREIGN KEY (kp_id) REFERENCES knowledge_point(id) ON DELETE CASCADE' +
  ')';

const DDL_REVIEW_EVENT: string =
  'CREATE TABLE IF NOT EXISTS review_event (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  kp_id INTEGER NOT NULL, ' +
  '  grade INTEGER NOT NULL, ' +
  '  mastery_before REAL, ' +
  '  mastery_after REAL, ' +
  '  reviewed_at INTEGER, ' +
  '  FOREIGN KEY (kp_id) REFERENCES knowledge_point(id) ON DELETE CASCADE' +
  ')';

const DDL_BEHAVIOR_LOG: string =
  'CREATE TABLE IF NOT EXISTS behavior_log (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  action_type TEXT NOT NULL, ' +
  '  target_type TEXT, ' +
  '  target_id INTEGER, ' +
  '  duration_ms INTEGER, ' +
  '  created_at INTEGER' +
  ')';

const DDL_PUSH_RECORD: string =
  'CREATE TABLE IF NOT EXISTS push_record (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  '  push_type TEXT NOT NULL, ' +
  '  kp_ids TEXT, ' +
  '  pushed_at INTEGER, ' +
  '  clicked INTEGER DEFAULT 0' +
  ')';

const ALL_DDL: string[] = [
  DDL_NOTE, DDL_CHUNK, DDL_EMBEDDING, DDL_NOTE_LINK,
  DDL_KNOWLEDGE_POINT, DDL_CHUNK_KP, DDL_KP_MASTERY,
  DDL_REVIEW_EVENT, DDL_BEHAVIOR_LOG, DDL_PUSH_RECORD
];

// ── 初始化 ──

export async function initDatabase(context: common.Context): Promise<void> {
  const STORE_CONFIG: relationalStore.StoreConfig = {
    name: 'HarmonyAgent.db',
    securityLevel: relationalStore.SecurityLevel.S3
  };

  try {
    let store: relationalStore.RdbStore = await relationalStore.getRdbStore(context, STORE_CONFIG);
    rdbStore = store;
    console.info(TAG + ' RdbStore opened');

    // 建表
    for (let i: number = 0; i < ALL_DDL.length; i++) {
      let sql: string = ALL_DDL[i];
      try {
        await store.executeSql(sql);
        console.info(TAG + ' Table created: ' + sql.substring(0, 40));
      } catch (err) {
        console.error(TAG + ' Create table failed: ' + (err as BusinessError).message);
      }
    }
  } catch (err) {
    console.error(TAG + ' Get RdbStore failed: ' + (err as BusinessError).message);
    throw err;
  }
}

// ── 获取 store 实例（供其他模块用）──

export function getStore(): relationalStore.RdbStore | null {
  return rdbStore;
}
