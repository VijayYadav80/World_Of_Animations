using _2DAnimation.API.DTOs;

namespace _2DAnimation.API.Services;

public interface IProjectService
{
    Task<IReadOnlyList<ProjectSummaryDto>> ListAsync(CancellationToken ct);
    Task<ProjectSummaryDto> CreateAsync(CreateProjectRequest request, CancellationToken ct);

    // Phase 5
    Task<ProjectDetailDto?> GetAsync(Guid id, CancellationToken ct);
    Task<ProjectSummaryDto?> SaveAsync(Guid id, SaveProjectRequest request, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
    Task<bool> ExistsAsync(Guid id, CancellationToken ct);
}
