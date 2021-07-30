const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const puppeteer = require("puppeteer");
const cloudinary = require("cloudinary").v2;
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  GIT_REPO,
  URL,
} = process.env;
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const PORT = process.env.PORT || 5000;

// Create an express route
app.post("/api/og-generator", async (req, res) => {
  const commit = await getCommit();

  const commitTime = new Date(commit.commit.author.date).getTime();
  const currentTime = new Date().getTime();

  if (currentTime - commitTime < 24 * 60 * 60 * 1000) {
    getChangedPages(commit).then((pages) => {
      for (const page of pages) {
        takeScreenshot(page).then((screenshot) =>
          uploadScreenshot(screenshot, page)
        );
      }
      res.status(200).json(pages);
    });
  } else {
    res.status(200).json({
      code: "COMMIT_OVERTIME",
      message: "Commit too long ago, won't rerun OG image build.",
    });
  }
});

async function getCommit() {
  const branchResponse = await fetch(
    `https://api.github.com/repos/${GIT_REPO}/branches/master`
  );
  const branch = await branchResponse.json();

  const commitResponse = await fetch(branch.commit.url);
  return await commitResponse.json();
}

async function getChangedPages(commit) {
  const filesChanges = commit.files
    .filter((file) => file.filename.startsWith("src/pages"))
    .map((file) => file.filename)
    .map((filename) => filename.replace("src/pages/", URL))
    .map(
      (filename) => filename.substr(0, filename.lastIndexOf(".")) || filename
    );

  return filesChanges;
}

// See https://bitsofco.de/using-a-headless-browser-to-capture-page-screenshots
async function takeScreenshot(url) {
  console.log(`taking screenshot of ${url}...`);
  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 1200,
      height: 627,
      isLandscape: true,
    },
  });

  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle0" });

  const screenshot = await page.screenshot({
    encoding: "binary",
  });

  await browser.close();

  return screenshot;
}

function renamePath(path) {
  return path
    .replaceAll("https://", "")
    .replaceAll("/", "_")
    .replaceAll(/\\/g, "_");
}

function uploadScreenshot(screenshot, page) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "og-images",
      public_id: renamePath(page),
      overwrite: true,
    };
    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      })
      .end(screenshot);
    console.log(`Upload of ${page} complete!`);
  });
}

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
