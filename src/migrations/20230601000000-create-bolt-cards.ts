import { Db } from "mongodb"

module.exports = {
  async up(db: Db) {
    await db.createCollection("boltcards")
    await db.createCollection("cardusages")

    await db.collection("boltcards").createIndex({ walletId: 1 })
    await db.collection("boltcards").createIndex({ uid: 1 }, { unique: true })
    
    await db.collection("cardusages").createIndex({ cardId: 1 })
    await db.collection("cardusages").createIndex({ cardId: 1, createdAt: -1 })
  },

  async down(db: Db) {
    await db.collection("cardusages").drop()
    await db.collection("boltcards").drop()
  },
}