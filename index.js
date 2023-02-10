/**
 * This is the main entrypoint to my Probot app
 * @param {import('probot').Probot} app
 */

module.exports = (app) => {
  app.on("release", async (context) => {
    const USERNAME = context.payload.installation.account.login;
    const REPO_NAME = context.payload.repository.name;

    const { data: starredRepos } =
      await context.octokit.activity.listReposStarredByUser({
        username: context.payload.installation.account.login,
      });

    const repoLinks = starredRepos.map((repo) => repo.html_url);

    for (const repoLink of repoLinks) {
      const releasesUrl = `${repoLink}/releases`;
      const res = await context.github.request({
        method: "GET",
        url: releasesUrl,
      });

      const $ = cheerio.load(res.data);
      const latestRelease = $(
        "a.btn-link.btn-change-status.js-filterable-field"
      )
        .first()
        .text()
        .trim();

      // Write the new releases information to a file in the repository
      const releasesFile = "releases.md";

      try {
        const file = await context.github.repos.getContents({
          owner: USERNAME,
          repo: REPO_NAME,
          path: releasesFile,
        });

        const content = Buffer.from(file.data.content, "base64").toString();
        const newContent = `${content}\n- [${repoLink}](${releasesUrl}): ${latestRelease}`;

        await context.github.repos.createOrUpdateFile({
          owner: USERNAME,
          repo: REPO_NAME,
          path: releasesFile,
          message: `Add release: ${repoLink} ${latestRelease}`,
          content: Buffer.from(newContent).toString("base64"),
          sha: file.data.sha,
        });
      } catch (error) {
        if (error.status === 404) {
          // File does not exist, create it
          await context.github.repos.createOrUpdateFile({
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
