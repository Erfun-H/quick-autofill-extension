(() => {
  if (window.__quickAutofillInjected) return;
  window.__quickAutofillInjected = true;

  let autofillButton = null;
  let activeField = null;

  const FIELD_MAP = {
    name: [
      "name",
      "full name",
      "fullname",
      "your name",
      "first name",
      "last name",
    ],
    email: ["email", "e-mail", "mail"],
    phone: ["phone", "mobile", "tel", "telephone", "cell"],
    address: [
      "address",
      "street",
      "location",
      "addr",
      "shipping address",
      "billing address",
    ],
  };

  function normalize(value) {
    return (value || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
  }

  function getLabelText(el) {
    const id = el.id;
    let text = "";

    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) text += " " + label.innerText;
    }

    const parentLabel = el.closest("label");
    if (parentLabel) text += " " + parentLabel.innerText;

    return normalize(text);
  }

  function collectFieldHints(el) {
    return normalize(
      [
        el.name,
        el.id,
        el.placeholder,
        el.getAttribute("aria-label"),
        el.getAttribute("autocomplete"),
        getLabelText(el),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function detectProfileKey(el) {
    const hints = collectFieldHints(el);

    for (const [profileKey, patterns] of Object.entries(FIELD_MAP)) {
      for (const pattern of patterns) {
        if (hints.includes(pattern)) {
          return profileKey;
        }
      }
    }

    const type = normalize(el.type);
    if (type === "email") return "email";
    if (type === "tel") return "phone";

    return null;
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getFillableFields() {
    return [...document.querySelectorAll("input, textarea, select")].filter(
      (el) => {
        const tag = el.tagName.toLowerCase();
        const type = normalize(el.type);

        if (el.disabled || el.readOnly) return false;
        if (
          type === "hidden" ||
          type === "password" ||
          type === "file" ||
          type === "submit" ||
          type === "button" ||
          type === "checkbox" ||
          type === "radio"
        )
          return false;
        if (tag === "select") return false;

        return true;
      },
    );
  }

  async function getProfile() {
    return new Promise((resolve) => {
      chrome.storage.sync.get("profile", ({ profile }) => {
        resolve(profile || {});
      });
    });
  }

  async function autofillPage() {
    const profile = await getProfile();
    if (!profile || Object.keys(profile).length === 0) {
      return { success: false, filledCount: 0 };
    }

    let filledCount = 0;
    const fields = getFillableFields();

    for (const field of fields) {
      const key = detectProfileKey(field);
      if (!key) continue;

      const value = profile[key];
      if (!value) continue;

      setNativeValue(field, value);
      filledCount++;
    }

    return { success: filledCount > 0, filledCount };
  }

  function removeInlineButton() {
    if (autofillButton) {
      autofillButton.remove();
      autofillButton = null;
    }
    activeField = null;
  }

  function createInlineButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "⚡ Autofill";
    btn.setAttribute("aria-label", "Autofill this form");
    Object.assign(btn.style, {
      position: "fixed",
      zIndex: "2147483647",
      padding: "8px 12px",
      borderRadius: "999px",
      border: "1px solid rgba(37,99,235,.18)",
      background: "linear-gradient(135deg, #2563eb, #3b82f6)",
      color: "white",
      fontSize: "12px",
      fontWeight: "700",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 10px 20px rgba(37,99,235,.22)",
      cursor: "pointer",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.filter = "brightness(1.05)";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.filter = "brightness(1)";
    });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await autofillPage();
      removeInlineButton();
    });

    document.documentElement.appendChild(btn);
    return btn;
  }

  function positionInlineButton(field) {
    if (!autofillButton) return;

    const rect = field.getBoundingClientRect();
    const top = rect.top + Math.min(rect.height / 2, 20);
    const left = Math.min(rect.right - 110, window.innerWidth - 120);

    autofillButton.style.top = `${Math.max(8, top)}px`;
    autofillButton.style.left = `${Math.max(8, left)}px`;
  }

  function shouldShowButton(field) {
    if (!field) return false;
    if (
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      )
    )
      return false;
    if (field.disabled || field.readOnly) return false;

    const type = normalize(field.type);
    if (
      [
        "hidden",
        "password",
        "file",
        "checkbox",
        "radio",
        "submit",
        "button",
      ].includes(type)
    )
      return false;

    return !!detectProfileKey(field);
  }

  document.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!shouldShowButton(field)) {
      removeInlineButton();
      return;
    }

    activeField = field;

    if (!autofillButton) {
      autofillButton = createInlineButton();
    }

    positionInlineButton(field);
  });

  document.addEventListener("click", (event) => {
    if (!autofillButton) return;

    const clickedInsideButton = autofillButton.contains(event.target);
    const clickedField = activeField && activeField.contains(event.target);

    if (!clickedInsideButton && !clickedField) {
      removeInlineButton();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (autofillButton && activeField) {
        positionInlineButton(activeField);
      }
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (autofillButton && activeField) {
      positionInlineButton(activeField);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "AUTOFILL_NOW") {
      autofillPage().then((result) => sendResponse(result));
      return true;
    }
  });
})();
