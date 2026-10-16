# Google Sheets Backend Setup Guide

This application handles data storage using a Google Sheet and Google Apps Script. Follow these steps to set up your backend.

## 1. Create the Google Sheet
1. Go to [Google Sheets](https://sheets.google.com).
2. Create a **Blank** spreadsheet.
3. Name it "Food Ordering System DB" (or anything you like).

## 2. Set up the Script
1. In your new spreadsheet, click on **Extensions** > **Apps Script** in the menu.
2. A new tab will open with a code editor.
3. Delete any default code in the `Code.gs` file.
4. Copy the **entire content** of the `Code.gs` file from this project folder.
5. Paste it into the Google Apps Script editor.
6. Click the **Save** icon (disk) or press `Ctrl+S` / `Cmd+S`.

## 3. Initialize the Database
1. In the toolbar, locate the function dropdown menu (it might say `doGet` or `myFunction`).
2. Select **`setupDatabase`** from the list.
3. Click the **Run** button |> .
4. You will be prompted to Review Permissions.
   - Click **Review Permissions**.
   - Choose your Google Account.
   - If you see "Google hasn't verified this app", click **Advanced** > **Go to ... (unsafe)**. (This is safe because it's your own code).
   - Click **Allow**.
5. Wait for the execution to finish. You should see "Database setup complete!" in the Execution Log.
6. Switch back to your Google Sheet tab. You should now see 4 tabs: `Config`, `Menu`, `Orders`, and `OrderItems` with some sample data.

## 4. Deploy the API
1. In the Apps Script editor, click the blue **Deploy** button > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the details:
   - **Description**: Food Ordering API
   - **Execute as**: **Me** (your email)
   - **Who has access**: **Anyone**
     - *Note: "Anyone" is required so the customer app can talk to the sheet without needing a Google login.*
4. Click **Deploy**.
5. Copy the **Web App URL** (it ends with `/exec`).

## 5. Connect the App
1. Open `admin.js` in your project folder.
2. Find `const CONFIG = { API_URL: ... }` near the top.
3. Replace `'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE'` with your **Web App URL**.
4. Open `app.js` in your project folder.
5. Do the same replacement for `CONFIG.API_URL`.

## 6. Login
- Open `admin.html` in your browser.
- The default Admin Password is: **`NOT_CONFIGURED`**
- You can change this later in the Admin Settings/Config sheet.
