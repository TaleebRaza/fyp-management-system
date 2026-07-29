# Milestone 5B — Student Draft and Template State

Base commit: `f65fc2bfa2d64449721fe8116b65b9ddc89bf84c`

## Scope

This milestone extracts two browser-side workflows from `StudentDashboard.tsx`:

1. Project text/PDF draft restoration, debounced persistence, clearing, and reset.
2. Stage template caching, preview state, rich clipboard copying, and reset.

## Preserved contracts

- Draft local-storage key: `fyp-portal:student-project-draft:v1:<userId>`
- PDF draft key: the text key plus `:pdf`
- Draft save delay: 300 ms
- Template endpoint and stage query
- Clipboard HTML and plain-text formats
- Template copied indicator duration: 1800 ms
- Existing dashboard props and backend routes

## Deliberately deferred

Team membership, supervisor assignment/change, academic updates, and other student mutations remain in the dashboard for Milestone 5C.
