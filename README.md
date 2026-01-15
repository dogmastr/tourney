# Chess Swiss Tournament Manager

Built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

### Prerequisites

- Node.js 18+
- npm or yarn
- AWS account + credentials (for Amplify Gen 2)

### Installation

1. Install dependencies:
```bash
npm install
```

### Running the Backend

This repo ignores `amplify_outputs.json`; contributors should generate their own.

1. Configure AWS credentials (one-time):
```bash
aws configure
# or set AWS_PROFILE / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION
```

2. Personal sandbox backend (recommended for local dev):
```bash
npx ampx sandbox
```
Leave this running; it writes `amplify_outputs.json` at the repo root.

### Run the app

1. Start the dev server in a second terminal:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

This project is licensed under the GNU Affero General Public License v3.0.
