/**
 * This is the main entrypoint to my Probot app
 * @param {import('probot').Probot} app
 */
const cheerio = require("cheerio");
const axios = require("axios");

module.exports = async (app) => {
  app.on("issues.opened", async (context) => {
    const USERNAME = context.payload.repository.owner.login;
    const REPO_NAME = context.payload.repository.name;

    const { data: starredRepos } =
      await context.octokit.activity.listReposStarredByUser({
        username: USERNAME,
      });

    const repoLinks = starredRepos.map((repo) => repo.html_url);

    // loop through each starred repo and update the releases.md file
    for (const repoLink of repoLinks) {
      const releasesUrl = `${repoLink}/releases`;
      const releasesFile = "releases.md";
      let latestRelease = "";

      try {
        // get the releases.md file content
        const file = await context.octokit.repos.getContent({
          owner: USERNAME,
          repo: REPO_NAME,
          path: releasesFile,
        });

        const content = Buffer.from(file.data.content, "base64").toString();

        // get the latest release for the repo
        const response = await axios.get(releasesUrl);
        const $ = cheerio.load(response.data);
        latestRelease = $("span.Label.Label--success.label--large")
          .first()
          .text()
          .trim();

        if (latestRelease === "Latest") {
          const newContent = `${content}\n- [${repoLink}](${releasesUrl}): ${latestRelease}`;

          const updatedFile =
            await context.octokit.repos.createOrUpdateFileContents({
              owner: USERNAME,
              repo: REPO_NAME,
              path: releasesFile,
              message: `Add release: ${repoLink} ${latestRelease}`,
              content: Buffer.from(newContent).toString("base64"),
              sha: file.data.sha,
            });

          // Create an issue with a comment mentioning the user when there's a new release
          const issue = await context.octokit.issues.create({
            owner: USERNAME,
            repo: REPO_NAME,
            title: `New release available: ${repoLink}`,
            body: `A new release (${latestRelease}) is available for the repository ${repoLink}!`,
          });

          await context.octokit.issues.createComment({
            owner: USERNAME,
            repo: REPO_NAME,
            issue_number: issue.data.number,
            body: `Hi @${USERNAME}, a new release (${latestRelease}) is available for the repository ${repoLink}!`,
          });
        }
      } catch (error) {
        if (error.status === 404) {
          // releases.md file does not exist, create it
          await context.octokit.repos.createOrUpdateFileContents({
            owner: USERNAME,
            repo: REPO_NAME,
            path: releasesFile,
            message: `Create file: ${releasesFile}`,
            content: Buffer.from(
              `- [${repoLink}](${releasesUrl}): ${latestRelease}`
            ).toString("base64"),
          });
        } else {
          throw error;
        }

        // Check if an issue already exists for the new release
        let existingIssue = false;

        const issues = await context.octokit.issues.listForRepo({
          owner: USERNAME,
          repo: REPO_NAME,
          state: "open",
        });

        for (const issue of issues.data) {
          if (issue.title === `New release available: ${repoLink}`) {
            existingIssue = true;
            // Create a comment on the existing issue
            await context.octokit.issues.createComment({
              owner: USERNAME,
              repo: REPO_NAME,
              issue_number: issue.number,
              body: `Hi @${USERNAME}, a new release (${latestRelease}) is available for the repository ${repoLink}!`,
            });
            break;
          }
        }

        // If no existing issue was found, create a new one
        if (!existingIssue) {
          const issue = await context.octokit.issues.create({
            owner: USERNAME,
            repo: REPO_NAME,
            title: `New release available: ${repoLink}`,
            body: `A new release (${latestRelease}) is available for the repository ${repoLink}!`,
          });

          await context.octokit.issues.createComment({
            owner: USERNAME,
            repo: REPO_NAME,
            issue_number: issue.data.number,
            body: `Hi @${USERNAME}, a new release (${latestRelease}) is available for the repository ${repoLink}!`,
          });
        }
      }
    }
  });
};
