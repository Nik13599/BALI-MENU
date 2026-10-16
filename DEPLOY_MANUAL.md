# How to Deploy to GitHub Pages (Manual Upload)

Since Git doesn't seem to be installed on your computer, you can deploy your app by uploading the files directly to the GitHub website.

## 1. Create a Repository
1. Log in to [GitHub.com](https://github.com).
2. Click the **+** icon in the top-right corner and select **New repository**.
3. Name it something like `food-ordering-app`.
4. Make sure it is **Public**.
5. Check **"Add a README file"**.
6. Click **Create repository**.

## 2. Upload Your Files
1. In your new repository, click the **Add file** button (top right of the file list) > **Upload files**.
2. Drag and drop **ALL** the files from your folder `e:\food ordering and tracking app\` into the GitHub box.
   - **Crucial Files**: `index.html`, `admin.html`, `track.html`, `app.js`, `admin.js`, `track.js`, `styles.css`, `admin.css`.
   - *Note: You don't need to upload `Code.gs` or the `.md` files, but it's fine if you do.*
3. Wait for them to buffer.
4. Scroll down to "Commit changes" and click the green **Commit changes** button.

## 3. Activate GitHub Pages
1. In your repository, click on the **Settings** tab (gear icon at the top).
2. On the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **"Build and deployment"** > **"Branch"**:
   - Select **`main`** (or `master`) from the dropdown.
   - Ensure the folder is set to `/(root)`.
   - Click **Save**.
4. Wait about 1-2 minutes. Refresh the page.
5. You will see a bar at the top saying "Your site is live at..." followed by a URL (e.g., `https://yourname.github.io/food-ordering-app/`).

## 4. Use Your App!
- **Customer App**: Click the link (it opens `index.html` by default).
- **Admin Panel**: Add `/admin.html` to the end of the link (e.g., `.../food-ordering-app/admin.html`).
- **Tracking Page**: Add `/track.html` to the end of the link.

**Note:** Since we updated your code to use the correct Google Script URL, it will work perfectly from this new website address!
