using System.Text.RegularExpressions;

namespace _2DAnimation.API.Services;

/// <summary>
/// Large binary files of a project (imported voice audio) live on the filesystem, not in the database.
/// Layout: {Storage:Root}/projects/{projectId}/audio/{assetId}
/// </summary>
public interface IProjectFileStore
{
    bool IsValidAssetId(string assetId);
    Task SaveAudioAsync(Guid projectId, string assetId, Stream data, CancellationToken ct);
    Stream? OpenAudio(Guid projectId, string assetId);
    void DeleteProject(Guid projectId);
}

public partial class ProjectFileStore(IConfiguration config, IWebHostEnvironment env) : IProjectFileStore
{
    // Asset ids come from the browser: only a safe, short charset is accepted (blocks "../" tricks).
    [GeneratedRegex("^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex AssetIdPattern();

    private string Root => Path.GetFullPath(config["Storage:Root"] ?? Path.Combine(env.ContentRootPath, "storage"));

    private string ProjectDir(Guid projectId) => Path.Combine(Root, "projects", projectId.ToString("N"));

    private string AudioDir(Guid projectId) => Path.Combine(ProjectDir(projectId), "audio");

    public bool IsValidAssetId(string assetId) => AssetIdPattern().IsMatch(assetId);

    public async Task SaveAudioAsync(Guid projectId, string assetId, Stream data, CancellationToken ct)
    {
        if (!IsValidAssetId(assetId)) throw new ArgumentException("Invalid audio id.", nameof(assetId));

        var dir = AudioDir(projectId);
        Directory.CreateDirectory(dir);
        var target = Path.Combine(dir, assetId);
        var temp = target + ".tmp";

        // Write to a temp file first so a failed upload never leaves a half-written audio file behind.
        await using (var output = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await data.CopyToAsync(output, ct);
        }
        File.Move(temp, target, overwrite: true);
    }

    public Stream? OpenAudio(Guid projectId, string assetId)
    {
        if (!IsValidAssetId(assetId)) return null;
        var path = Path.Combine(AudioDir(projectId), assetId);
        return File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read) : null;
    }

    public void DeleteProject(Guid projectId)
    {
        var dir = ProjectDir(projectId);
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }
}
