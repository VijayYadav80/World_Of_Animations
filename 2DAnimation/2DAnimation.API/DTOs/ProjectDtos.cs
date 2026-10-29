using System.ComponentModel.DataAnnotations;

namespace _2DAnimation.API.DTOs;

public class CreateProjectRequest
{
    [Required, StringLength(200, MinimumLength = 1)]
    public string Name { get; set; } = string.Empty;
}

public record ProjectSummaryDto(Guid Id, string Name, DateTime CreatedUtc, DateTime UpdatedUtc);

public record HealthDto(string Api, string Database, DateTime TimeUtc);
