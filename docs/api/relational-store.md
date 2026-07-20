# @ohos.data.relationalStore 参考 (SQLite)

> 来源: HarmonyOS API Reference V13 (Context7 MCP)
> 抓取日期: 2026-07-20

## 核心 API

### 建表 + 插入

```typescript
const CREATE_TABLE_TEST = "CREATE TABLE IF NOT EXISTS test (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
  "name TEXT NOT NULL, " +
  "age INTEGER, " +
  "salary REAL" +
  ")";

try {
  let value = new Uint8Array([1, 2, 3, 4, 5]);
  const valueBucket: relationalStore.ValuesBucket = {
    'name': "Lisa",
    'age': 18,
    'salary': 100.5,
    'codes': value,  // BLOB 通过 Uint8Array
  };
  if (store != undefined) {
    await (store as relationalStore.RdbStore).executeSql(CREATE_TABLE_TEST);
    await (store as relationalStore.RdbStore).insert('test', valueBucket);
  }
} catch (err) {
  console.error(`Insert fail, code:${err.code}, message: ${err.message}`);
}
```

### 向量数据插入 (Float32Array)

```typescript
// 使用参数绑定插入数据
let insertSql = "insert into test VALUES(?, ?);";
const vectorValue: Float32Array = Float32Array.from([1.5, 6.6]);
await store!.execute(insertSql, [0, vectorValue]);
```

### executeSql

```typescript
const SQL_DELETE_TABLE = "DELETE FROM test WHERE name = 'zhangsan'";
if (store != undefined) {
  (store as relationalStore.RdbStore).executeSql(SQL_DELETE_TABLE).then(() => {
    console.info('Delete table done.');
  }).catch((err: BusinessError) => {
    console.error(`ExecuteSql failed, code is ${err.code},message is ${err.message}`);
  });
}
```

## ValuesBucket 三种写法

```typescript
// 方式1: 键名加引号
const vb1: relationalStore.ValuesBucket = { 'NAME': value1, 'AGE': value2 };
// 方式2: 键名不加引号
const vb2: relationalStore.ValuesBucket = { NAME: value1, AGE: value2 };
// 方式3: 双引号键名
const vb3: relationalStore.ValuesBucket = { "NAME": value1, "AGE": value2 };
```

## ConflictResolution

```typescript
store.insert("EMPLOYEE", valueBucket, relationalStore.ConflictResolution.ON_CONFLICT_REPLACE)
  .then((rowId: number) => { ... });
```

## 错误码速查

| 错误码 | 含义 |
|--------|------|
| 14800000 | 内部错误 |
| 14800011 | 数据库损坏 |
| 14800014 | 实例已关闭 |
| 14800015 | 数据库无响应 |
| 14800021 | SQLite 通用错误 |
| 14800023 | 访问权限被拒 |
| 14800024 | 数据库文件锁定 |
| 14800027 | 尝试写只读数据库 |
| 14800028 | 磁盘 I/O 错误 |
| 14800029 | 数据库已满 |
| 14800030 | 无法打开数据库文件 |
| 14800031 | TEXT/BLOB 超大小限制 |
| 14800032 | 约束冲突 |
| 14800033 | 数据类型不匹配 |
| 14800047 | WAL 文件超大小限制 |
