# Technical Documentation

## Overview
Single-page portfolio inspired by Andrew Ng. Core sections: hero, about, projects (filter/sort + toggle visibility), GitHub API feed, and contact form with validation. States are managedby `js/script.js` via an array of object; no build tools or frameworks required.

## Architecture
- `index.html`: semantic structure and UI controls.
- `css/styles.css`: theming (light/dark), layout grid, responsive rules.
- `js/script.js`: state management, rendering logic, API integration, validation.
- `assets/images/`: optional optimized assets (not committed to keep repo light).

## State & Logic
- `state`: `{ projectsVisible, theme, visitorName, visitSeconds }` persisted (theme/name).
- Theme toggle: overrides css panel by setting the data-theme atrtribute as dark.
- Greeting persistence: updates on name input thats captured from the contact form input.
- Visit timer: refreshes when page is refreshed
- Projects: filter (`select#project-filter`) and sort (`select#project-sort`) to filter projects and sort them based on categories and alphabetical order or time order.
- GitHub feed: `fetchRepos(username)` calls `https://api.github.com/users/{user}/repos?sort=updated&per_page=5` to populate elmenets of the card class with the latest github repos with error handling.
- Contact validation: checks name length >= 2, email pattern, message length >= 10, and consent checkbox. with error and success alerts.

## API Integration
- Endpoint: await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=5`) for latest 5 pages
- Error handling: non-OK responses and network failures surface friendly status text; console logs for debugging.
- Loading: to make user aware of whats happening


## Extensibility Notes
- Replace placeholder hero copy and connect `Download CV` button to a PDF.
- Add more project entries to the `projects` array with `title`, `category`, `date`, `summary`, `stack`.
- Swap GitHub feed for another API by reusing the status + card pattern.
