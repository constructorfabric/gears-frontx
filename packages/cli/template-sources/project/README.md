# Quick Start Guide

## First Time Setup

1. Open terminal in your project folder
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open http://localhost:5173 in your browser
5. Install FrontX CLI globally (recommended with npm): `npm install -g @gears-frontx/cli@alpha`
6. Ask the AI: "Set up Chrome DevTools MCP server so you can see my browser"

## Creating Your First Screenset

### Step 1: Start Your AI Assistant

Open this project in one of these AI-powered editors:
- **Claude Code**
- **Cursor**
- **Windsurf**

### Step 2: Create a Draft Screenset

Type this command in your AI chat:

```
/frontx-new-screenset
```

The AI will ask you:
- **Name**: Give it a simple name like `dashboard` or `settings`
- **Category**: Choose `Drafts` (you can promote it later)
- **Initial screens**: Start with just one, like `home`

### Step 3: See Your Work

Your new screenset appears in the FrontX Studio screensets selector. Click to open it.

## Adding More Screens

To add a screen to your screenset:

```
/frontx-new-screen
```

## Making Changes

Describe what you want to the AI in plain language:
- "Add a button that shows a greeting"
- "Create a form with name and email fields"
- "Show a list of items from the API"

## If Something Goes Wrong

After applying, if the result isn't what you wanted:
- Ask the AI to fix it: "Remove the sidebar" or "Change the layout"
- Undo everything: "Undo the last changes" or use your editor's undo

## Checking Your Work

Before sharing your work, ask the AI to validate it:

```
/frontx-validate
```

The AI will check your code and report any issues.

## Getting Help

- Type `/frontx-quick-ref` for common patterns
- Type `/frontx-rules` to see guidelines for a topic
- Ask your AI assistant any question about the project

## Workflow Summary

```
Draft → Mockup → Production
```

1. **Draft**: Quick experiments, AI-generated
2. **Mockup**: Refined designs, human-reviewed
3. **Production**: Final, tested, ready for users

Start with drafts. Promote what works.
