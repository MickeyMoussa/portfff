const state = {
  projectsVisible: true,
  theme: localStorage.getItem("theme") || "dark",
  visitorName: localStorage.getItem("visitorName") || "guest",
  visitSeconds: 0,
};

const projects = [
  {
    title: "16-bit RISC CPU",
    category: "hardware",
    date: "2025-03-15",
    summary: "Solo three-day speedrun of building a 16-bit pipelined CPU implementing MIPS RISC architecture as well as numerous niche instructions.",
    stack: ["Verilog", "Timing STA", "Simulation"],
    image: "assets/images/cpu.jfif",
  },
  {
    title: "Actuarial ML Insurance Recommender",
    category: "ai",
    date: "2025-06-02",
    summary: "Developed a hybrid actuarial machine learning model that accurately predicts insurance coverage usage based on a policyholder’s profile using NumPy and TensorFlow",
    stack: ["Python", "Pandas", "TensorFlow"],
    image: "assets/images/matrix.jfif",
  },
  {
    title: "FPGA Smart Parking System",
    category: "hardware",
    date: "2024-04-22",
    summary: "Fully automated digital handicap-friendly smart parking system implemented in an Artix 7 FPGA, utilizing 7-segment display for displaying available parking places and green-red LED signaling to show if there're available spaces or not. No fancy libraries, pure Verilog. Shout-out to Salman al-Adwan for being my project partner.",
    stack: ["FPGA", "VHDL", "UART"],
    image: "assets/images/FPGA.jfif",
  }
];

function applyTheme() {
  const doc = document.documentElement;
  doc.setAttribute("data-theme", state.theme === "light" ? "light" : "dark");
  localStorage.setItem("theme", state.theme);
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  applyTheme();
}

function renderProjects(filterValue = "all", sortValue = "recent") {
  const list = document.getElementById("project-list");
  if (!list) return;

  const filtered = projects.filter((p) => filterValue === "all" || p.category === filterValue);
  const sorted = filtered.sort((a, b) => {
    if (sortValue === "alpha") return a.title.localeCompare(b.title);
    return new Date(b.date) - new Date(a.date);
  });

  list.innerHTML = "";
  sorted.forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      ${project.image ? `<div class="project-thumb" style="background-image: url('${project.image}');" role="presentation"></div>` : ""}
      <h3>${project.title}</h3>
      <p>${project.summary}</p>
      <div class="project-meta">
        <span>${project.category.toUpperCase()}</span>
        <span>${new Date(project.date).toLocaleDateString()}</span>
        <span>${project.stack.join(" | ")}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

async function fetchRepos(username) {
  const status = document.getElementById("repo-status");
  const repoList = document.getElementById("repo-list");
  if (!status || !repoList) return;

  status.textContent = "Loading...";
  repoList.innerHTML = "";

  const user = username?.trim() || "MickeyMoussa";
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=5`);
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
    const data = await res.json();
    status.textContent = `Showing latest updates for ${user}.`;
    data.forEach((repo) => {
      const card = document.createElement("article");
      card.className = "repo-card";
      card.innerHTML = `
        <h3><a href="${repo.html_url}" target="_blank" rel="noopener noreferrer">${repo.name}</a></h3>
        <p>${repo.description || "No description provided."}</p>
        <div class="repo-meta">
          <span>* ${repo.stargazers_count}</span>
          <span>Updated ${new Date(repo.updated_at).toLocaleDateString()}</span>
          <span>${repo.language || "General"}</span>
        </div>
      `;
      repoList.appendChild(card);
    });
  } catch (error) {
    status.textContent = "Couldn't load GitHub data. Please try again.";
    console.error(error);
  }
}

function toggleProjectsVisibility() {
  const list = document.getElementById("project-list");
  const btn = document.getElementById("toggle-projects");
  if (!list || !btn) return;
  state.projectsVisible = !state.projectsVisible;
  list.style.display = state.projectsVisible ? "grid" : "none";
  btn.textContent = state.projectsVisible ? "Hide projects" : "Show projects";
}

function updateVisitTimer() {
  const timerEl = document.getElementById("visit-timer");
  if (!timerEl) return;
  state.visitSeconds += 1;
  timerEl.textContent = `Time here: ${state.visitSeconds}s`;
}

function setGreeting(nameValue) {
  const greetingEl = document.getElementById("greeting");
  if (!greetingEl) return;
  const name = nameValue?.trim() || "guest";
  state.visitorName = name;
  greetingEl.textContent = `Welcome, ${name}.`;
  localStorage.setItem("visitorName", name);
}

function validateEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function validateContactForm(event) {
  event.preventDefault();
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const messageInput = document.getElementById("message");
  const consent = document.getElementById("consent");
  const status = document.getElementById("form-status");

  const errors = {
    name: "",
    email: "",
    message: "",
  };

  if (nameInput.value.trim().length < 2) {
    errors.name = "Please enter at least 2 characters.";
  }

  if (!validateEmail(emailInput.value)) {
    errors.email = "Enter a valid email address.";
  }

  if (messageInput.value.trim().length < 10) {
    errors.message = "Message should be at least 10 characters.";
  }

  if (!consent.checked) {
    errors.message = errors.message || "Please consent to be contacted.";
  }

  document.getElementById("name-error").textContent = errors.name;
  document.getElementById("email-error").textContent = errors.email;
  document.getElementById("message-error").textContent = errors.message;

  if (!errors.name && !errors.email && !errors.message) {
    status.textContent = "Message validated - ready to send!";
    status.style.color = "var(--accent)";
    setGreeting(nameInput.value);
  } else {
    status.textContent = "Fix the highlighted issues before sending.";
    status.style.color = "";
  }
}

function initInteractions() {
  applyTheme();
  setGreeting(state.visitorName);
  renderProjects();
  fetchRepos();
  setInterval(updateVisitTimer, 1000);

  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
  document.getElementById("project-filter")?.addEventListener("change", (e) => {
    renderProjects(e.target.value, document.getElementById("project-sort").value);
  });
  document.getElementById("project-sort")?.addEventListener("change", (e) => {
    renderProjects(document.getElementById("project-filter").value, e.target.value);
  });
  document.getElementById("toggle-projects")?.addEventListener("click", toggleProjectsVisibility);
  document.getElementById("contact-form")?.addEventListener("submit", validateContactForm);
  document.getElementById("name")?.addEventListener("input", (e) => setGreeting(e.target.value));
  document.getElementById("primary-cta")?.addEventListener("click", () =>
    document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" })
  );
  document.getElementById("cta-button")?.addEventListener("click", () =>
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })
  );
}

document.addEventListener("DOMContentLoaded", initInteractions);
