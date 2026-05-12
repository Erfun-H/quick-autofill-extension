const saveBtn = document.getElementById("save");
const fillBtn = document.getElementById("fill");
const toast = document.getElementById("toast");

const fields = {
  name: document.getElementById("name"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  address: document.getElementById("address"),
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function getProfileFromForm() {
  return {
    name: fields.name.value.trim(),
    email: fields.email.value.trim(),
    phone: fields.phone.value.trim(),
    address: fields.address.value.trim(),
  };
}

function setProfileToForm(profile = {}) {
  fields.name.value = profile.name || "";
  fields.email.value = profile.email || "";
  fields.phone.value = profile.phone || "";
  fields.address.value = profile.address || "";
}

chrome.storage.sync.get("profile", ({ profile }) => {
  if (profile) {
    setProfileToForm(profile);
  }
});

saveBtn.addEventListener("click", () => {
  const profile = getProfileFromForm();

  chrome.storage.sync.set({ profile }, () => {
    showToast("Profile saved successfully ✅");
  });
});

fillBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL_NOW" }, (response) => {
    if (chrome.runtime.lastError) {
      showToast("Page is not ready yet");
      return;
    }

    if (response?.success) {
      showToast("Page autofilled ⚡");
    } else {
      showToast("No matching fields found");
    }
  });
});
