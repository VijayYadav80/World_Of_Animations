namespace _2DAnimation.API.Entities;

/// <summary>
/// One animation project. The whole scene (tracks, clips, dialogue, keyframes)
/// is stored as a single JSON document in <see cref="SceneJson"/>.
/// Large binary files (images, audio, exports) stay on the filesystem.
/// </summary>
public class Project
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string SceneJson { get; set; } = "{}";
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
}
