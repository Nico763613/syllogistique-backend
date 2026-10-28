import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  // GET /search?q=camion12
  @Get()
  search(@Query('q') q: string, @Query('siteId') siteId: string | undefined, @CurrentUser() actor: any) {
    return this.searchService.search(q, siteId || actor.siteId);
  }
}
