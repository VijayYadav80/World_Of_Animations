using System.ComponentModel.DataAnnotations;

namespace _2DAnimation.API.DTOs;

public class CreateProjectRequest
{
    [Required, StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}

/// <summary>Phase 5: saves the project name and the whole scene (a JSON document written by the UI).</summary>
public class SaveProjectRequest
{
    [Required, StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;

    [Required, StringLength(20_000_000, MinimumLength = 2)]
    public string SceneJson { get; set; } = "{}";
}

public record ProjectSummaryDto(Guid Id, string Name, DateTime CreatedUtc, DateTime UpdatedUtc);

public record ProjectDetailDto(Guid Id, string Name, string SceneJson, DateTime CreatedUtc, DateTime UpdatedUtc);

public record HealthDto(string Api, string Database, DateTime TimeUtc);
