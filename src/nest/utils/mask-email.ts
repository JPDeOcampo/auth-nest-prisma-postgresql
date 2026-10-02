export const maskEmail = (email?: string): string => {
  if (!email || !email.includes("@")) return "";

  const [name = "", domain = ""] = email.split("@");
  if (!name || !domain) return "";

  const len = name.length;
  if (len === 1) return `*@${domain}`;
  if (len === 2) return `${name[0]}*@${domain}`;

  if (len <= 6) {
    const visible = name.slice(0, 2);
    const masked = "*".repeat(len - 2);
    return `${visible}${masked}@${domain}`;
  }

  const first = name.slice(0, 3);
  const last = name.slice(-3);
  const masked = "*".repeat(len - 6);
  return `${first}${masked}${last}@${domain}`;
};
