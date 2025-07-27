# Dairy Depreciation Dashboard

A comprehensive React/TypeScript application for managing dairy cow depreciation and financial tracking with Supabase backend.

## 🚀 Features

- **Cow Asset Management**: Track individual cows with detailed depreciation calculations
- **Journal Entry Automation**: Automatic creation of acquisition, depreciation, and disposition journals
- **Multi-Company Support**: Manage multiple dairy operations
- **Real-time Dashboard**: Live statistics and financial overview
- **Batch Processing**: Efficient handling of large datasets
- **Performance Optimized**: Caching and optimized database queries

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: shadcn/ui, Tailwind CSS, Radix UI
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **State Management**: React Query, Context API
- **Testing**: Vitest, Testing Library
- **Code Quality**: ESLint, Prettier, TypeScript strict mode

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Git

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd dairy-depreciation-dashboard
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your Supabase credentials:

```bash
cp env.example .env.local
```

Edit `.env.local` with your Supabase project details:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 3. Database Setup

Run the Supabase migrations to set up your database schema:

```bash
npx supabase db push
```

### 4. Start Development

```bash
npm run dev
```

Visit `http://localhost:8080` to see your application.

## 📚 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run type-check` - Run TypeScript type checking
- `npm run test` - Run tests
- `npm run test:coverage` - Run tests with coverage
- `npm run audit` - Check for security vulnerabilities
- `npm run format` - Format code with Prettier

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
├── contexts/           # React contexts (Auth, etc.)
├── domain/            # Business logic and domain layer
│   ├── batch/         # Batch processing utilities
│   ├── cache/         # Performance caching
│   ├── config/        # Configuration constants
│   ├── depreciation/  # Depreciation calculations
│   ├── journal/       # Journal entry management
│   ├── validation/    # Data validation schemas
│   └── types/         # Type definitions
├── hooks/             # Custom React hooks
├── integrations/      # External service integrations
├── lib/              # Utility functions
├── pages/            # Page components
└── types/            # Global type definitions
```

## 🔧 Development Guidelines

### Code Quality
- Use TypeScript strict mode
- Follow ESLint rules
- Format code with Prettier
- Write tests for new features

### Performance
- Use the caching layer for expensive calculations
- Implement batch processing for large datasets
- Optimize database queries with proper indexes

### Security
- Never commit environment variables
- Use proper authentication and authorization
- Validate all user inputs
- Keep dependencies updated

## 🐛 Troubleshooting

### Common Issues

1. **ESLint errors**: Run `npm run lint:fix` to auto-fix issues
2. **TypeScript errors**: Run `npm run type-check` to see type issues
3. **Build failures**: Check that all environment variables are set
4. **Database connection**: Verify Supabase credentials in `.env.local`

### Getting Help

- Check the [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md) for database changes
- Review [JOURNAL_SYSTEM_SOLUTION.md](./JOURNAL_SYSTEM_SOLUTION.md) for journal automation details
- Open an issue for bugs or feature requests

## 📄 License

This project is proprietary software. All rights reserved.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

**Note**: This is a production application for dairy farm management. Please ensure all changes are thoroughly tested before deployment.
