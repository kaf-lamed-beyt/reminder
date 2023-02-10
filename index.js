/**
 * This is the main entrypoint to my Probot app
 * @param {import('probot').Probot} app
 */

// Webhook handler function
module.exports = async (app) => {
  app.on("push", async (context) => {
    const USERNAME = context.payload.installation.account.login;
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
        const latestRelease = $("span.Label.Label--success.label--large")
          .first()
          .text()
          .trim();

        if (latestRelease === "Latest") {
          const newContent = `${content}\n- [${repoLink}](${releasesUrl}): ${latestRelease}`;
          await context.octokit.repos.createOrUpdateFile({
            owner: USERNAME,
            repo: REPO_NAME,
            path: releasesFile,
            message: `Add release: ${repoLink} ${latestRelease}`,
            content: Buffer.from(newContent).toString("base64"),
            sha: file.data.sha,
          });
        }
      } catch (error) {
        if (error.status === 404) {
          // releases.md file does not exist, create it
          await context.octokit.repos.createOrUpdateFile({
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
      }

      context.octokit.issues.createComment(
        context.issue({
          body: `Hi @${USERNAME}, a new release (${latestRelease}) is available for the repository ${repoLink}!`,
        })
      );
    }
  });
};
