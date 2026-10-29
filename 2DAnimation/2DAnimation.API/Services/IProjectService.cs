using _2DAnimation.API.DTOs;

namespace _2DAnimation.API.Services;

public interface IProjectService
{
    Task<IReadOnlyList<ProjectSummaryDto>> ListAsync(CancellationToken ct);
    Task<ProjectSummaryDto> CreateAsync(CreateProjectRequest request, CancellationToken ct);
}
