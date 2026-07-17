# Validation Notes

This project no longer includes a Python engine. Validate the TypeScript-only architecture with:

```bash
npm run check
npm test --prefix backend
npm run build
cd backend && npx prisma validate && npx prisma generate
```
