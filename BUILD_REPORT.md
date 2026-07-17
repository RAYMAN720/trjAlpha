# Build Report

Professional V2 has been migrated to a TypeScript-only backend architecture.

- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite
- Worker: Node.js + TypeScript
- Database: Prisma with SQLite locally and PostgreSQL on Render
- Python dependency: removed

Run validation with:

```bash
npm run check
npm test --prefix backend
npm run build
cd backend && npx prisma validate && npx prisma generate
```
