const logoUrl = `${process.env.ORIGIN}/icons/briefcase_48x48.png`;

interface EmailLayoutProps {
  title: string;
  content: string;
}

export const emailLayout = ({ title, content }: EmailLayoutProps) => {
  return `
  <html>
    <body
      style="
        margin:0;
        padding:24px 0;
        background:#f4f4f4;
        font-family:Arial,sans-serif;
      "
    >
      <div
        style="
          max-width:600px;
          margin:auto;
          padding:20px;
          background:white;
          border-radius:8px;
        "
      >

        <div style="text-align:center">

          <table
            role="presentation"
            align="center"
          >
            <tr>

              <td>
                <img
                  src="${logoUrl}"
                  width="48"
                  height="48"
                />
              </td>

              <td>
                <h1
                  style="
                    margin-left:8px;
                    color:#2b7fff;
                  "
                >
                  XYZ
                </h1>
              </td>

            </tr>
          </table>

          <h2>${title}</h2>

        </div>

        ${content}

        <div
          style="
            margin-top:24px;
            text-align:center;
            color:#888;
          "
        >
          © ${new Date().getFullYear()}
          XYZ
        </div>

      </div>
    </body>
  </html>
  `;
};
