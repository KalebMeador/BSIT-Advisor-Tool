"use strict";

const byId = id => document.getElementById(id);
const storageKey = "ksm-bsit-advisor-2026-v1";

let catalog;
let state = {
    completed: [],
    planned: [],
    notes: {},
    term: "Fall"
};

function element(tag, text, className) {
    const node = document.createElement(tag);

    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;

    return node;
}

function persist() {
    try {
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
        byId("message").textContent =
            "Browser storage is unavailable. Changes apply to this session.";
    }
}

// Each inner array is an OR group. Every group must pass (AND).
function reasons(course) {
    const done = state.completed;

    if (done.includes(course.code)) return ["Completed"];

    const missing = course.requires.filter(group =>
        !group.some(id => done.includes(id))
    );

    const issues = missing.map(group => "Complete " + group.join(" or "));

    for (const id of course.concurrent) {
        if (!done.includes(id) && !state.planned.includes(id)) {
            issues.push("Complete or plan " + id);
        }
    }

    if (!course.offered.includes(state.term)) {
        issues.push("Offered " + course.offered.join(" / "));
    }

    if (course.type === "Elective" && !state.extraElectives) {
        const selected = catalog.courses.find(item =>
            item.type === "Elective" &&
            item.code !== course.code &&
            (done.includes(item.code) || state.planned.includes(item.code))
        );

        if (selected) {
            issues.push(
                "Elective slot filled by " + selected.code +
                ". Enable extra electives to take another."
            );
        }
    }

    return issues;
}

function update(message) {
    const removed = [];
    let previous;

    // Removing one course can also invalidate another course's corequisite.
    do {
        previous = state.planned.length;

        state.planned = state.planned.filter(id => {
            const course = catalog.courses.find(c => c.code === id);

            if (course && reasons(course).length === 0) return true;

            removed.push(id);
            return false;
        });
    } while (previous !== state.planned.length);

    const removalMessage = removed.length
        ? "Removed from plan: " + removed.join(", ") + "."
        : "";

    byId("message").textContent = [message, removalMessage]
        .filter(Boolean)
        .join(" ");

    persist();
    render();
}

function addCourse(id) {
    const course = catalog.courses.find(c => c.code === id);

    if (!course || reasons(course).length || state.planned.includes(id)) {
        return;
    }

    state.planned.push(id);
    update(id + " added.");
}

function historyGroup(title, ids, exclusive, note) {
    const field = element("fieldset");

    field.append(element("legend", title + (exclusive ? " · choose one" : "")));
    if (note) field.append(element("p", note));

    for (const id of ids) {
        const label = element("label");
        const input = element("input");

        input.type = "checkbox";
        input.id = "history-" + id;
        input.checked = state.completed.includes(id);
        input.disabled = exclusive && !input.checked &&
            ids.some(code => state.completed.includes(code));

        input.onchange = () => {
            if (input.checked) {
                state.completed.push(id);
            } else {
                state.completed = state.completed.filter(code => code !== id);
            }

            update(id + (input.checked ? " marked completed." : " removed from history."));
            byId(input.id).focus();
        };

        // Core and elective records carry their own titles.
        // Foundation courses get their titles from the JSON lookup.
        const course = catalog.courses.find(item => item.code === id);
        const title = course?.title ?? catalog.foundationTitles[id];
        label.append(input, " " + id + " · " + title);

        field.append(label);
    }

    return field;
}

function courseDetails(course) {
    const details = element("details");
    details.append(element("summary", "Requirements & notes"));

    const groups = course.requires.map(group => "(" + group.join(" or ") + ")");
    details.append(element("p",
        "Prerequisites: " + (groups.join(" and ") || "None listed") + "."
    ));

    if (course.concurrent.length) {
        details.append(element("p",
            "Prior or concurrent: " + course.concurrent.join(" and ")
        ));
    }

    details.append(element("p", "Catalog terms: " + course.offered.join(", ")));
    if (course.note) details.append(element("p", course.note));

    const link = element("a", "Course catalog ↗");
    link.href = course.url;
    link.target = "_blank";
    link.rel = "noopener";

    const label = element("label", "My note for " + course.code);
    const note = element("textarea");

    note.value = state.notes[course.code] || "";
    note.oninput = () => {
        state.notes[course.code] = note.value;
        persist();
    };

    label.append(note);
    details.append(link, element("hr"), label);

    return details;
}

function courseCard(course, issues) {
    const planned = state.planned.includes(course.code);
    const card = element("article");
    const head = element("div", undefined, "course-head");

    head.append(
        element("span", course.code, "code"),
        element("small", course.type + " · " + course.credits + " cr")
    );

    card.append(head, element("h3", course.title));

    const status = issues.join(" · ") ||
        (planned ? "In your plan" : "Eligible for " + state.term);

    card.append(element("p", status, issues.length ? "rules blocked" : "rules status"));

    const details = courseDetails(course);
    const add = element("button", planned ? "In plan" : "Add to plan");

    add.disabled = planned || issues.length > 0;
    add.setAttribute("aria-label", add.textContent + ": " + course.code);
    add.onclick = () => addCourse(course.code);

    card.draggable = !add.disabled;
    card.ondragstart = event => {
        event.dataTransfer.setData("text/plain", course.code);
    };

    card.append(details, add);
    return card;
}

function render() {
    const history = byId("history");
    history.replaceChildren();

    for (const group of catalog.historyGroups) {
        history.append(historyGroup(
            group.title,
            group.choices,
            group.chooseOne,
            group.note
        ));
    }

    for (const type of ["Core", "Elective"]) {
        const codes = catalog.courses
            .filter(course => course.type === type)
            .map(course => course.code);

        history.append(historyGroup(type + " courses", codes, false));
    }

    byId("total").textContent = " · " + state.completed.length;
    byId("term").value = state.term;
    byId("extra").checked = Boolean(state.extraElectives);

    const available = byId("courses");
    const locked = byId("locked");

    available.replaceChildren();
    locked.replaceChildren();

    for (const course of catalog.courses) {
        if (state.completed.includes(course.code) ||
            state.planned.includes(course.code)) {
            continue;
        }

        const issues = reasons(course);
        const destination = issues.length ? locked : available;
        destination.append(courseCard(course, issues));
    }

    byId("locked-count").textContent = "(" + locked.children.length + ")";
    byId("requirements").hidden = locked.children.length === 0;

    if (!available.children.length) {
        available.append(element("p",
            "No courses available to add for " + state.term +
            ". Review your completed courses or choose another term."
        ));
    }

    const plan = byId("plan");
    plan.replaceChildren();
    let credits = 0;

    for (const id of state.planned) {
        const course = catalog.courses.find(c => c.code === id);
        credits += course.credits;

        const row = element("div", undefined, "plan-row");
        const remove = element("button", "Remove");

        remove.setAttribute("aria-label", "Remove " + id);
        remove.onclick = () => {
            state.planned = state.planned.filter(code => code !== id);
            update(id + " removed.");
        };

        row.append(element("span", id + " · " + course.title), remove);
        plan.append(row, courseDetails(course));
    }

    byId("credits").textContent =
        state.planned.length + " planned · " + credits + " credits";
}

function start() {
    catalog = JSON.parse(byId("course-data").textContent);

    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));

        if (
            saved &&
            Array.isArray(saved.completed) &&
            Array.isArray(saved.planned) &&
            saved.notes &&
            typeof saved.notes === "object" &&
            ["Fall", "Spring", "Summer"].includes(saved.term)
        ) {
            state = saved;
        }
    } catch {
        // A new session can run without saved data.
    }

    byId("term").onchange = event => {
        state.term = event.target.value;
        update("Plan checked for " + state.term + ".");
    };

    byId("extra").onchange = event => {
        state.extraElectives = event.target.checked;

        if (!state.extraElectives) {
            const electives = catalog.courses
                .filter(course => course.type === "Elective")
                .map(course => course.code);

            const first = state.completed.find(id => electives.includes(id)) ||
                state.planned.find(id => electives.includes(id));

            const extras = state.planned.filter(id =>
                electives.includes(id) && id !== first
            );

            state.planned = state.planned.filter(id => !extras.includes(id));

            update(extras.length
                ? "Removed extra electives: " + extras.join(", ") + "."
                : "One elective slot selected.");
        } else {
            update("Additional electives can now be planned.");
        }
    };

    const drop = byId("drop");

    drop.ondragover = event => {
        event.preventDefault();
        drop.classList.add("over");
    };

    drop.ondragleave = () => drop.classList.remove("over");

    drop.ondrop = event => {
        event.preventDefault();
        drop.classList.remove("over");
        addCourse(event.dataTransfer.getData("text/plain"));
    };

    update("");
}

try {
    start();
} catch (error) {
    console.error("Advisor startup failed:", error);
    byId("courses").textContent = "Could not start the advisor: " + error.message;
}