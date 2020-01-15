import { Scope } from '..';
import { Lane } from '../models';
import LaneId, { LocalLaneId } from '../../lane-id/lane-id';
import { LaneItem, IndexType } from '../objects/components-index';
import { Ref, Repository } from '../objects';
import { DEFAULT_LANE } from '../../constants';
import { TrackLane, ScopeJson } from '../scope-json';
import GeneralError from '../../error/general-error';

export default class Lanes {
  objects: Repository;
  scopeJson: ScopeJson;
  constructor(objects: Repository, scopeJson: ScopeJson) {
    this.objects = objects;
    this.scopeJson = scopeJson;
  }

  async listLanes(): Promise<Lane[]> {
    return (await this.objects.listObjectsFromIndex(IndexType.lanes)) as Lane[];
  }

  async loadLane(id: LaneId): Promise<Lane | null> {
    if (id.isDefault()) return null; // master lane is not saved
    const filter = (lane: LaneItem) => lane.toLaneId().isEqual(id);
    const hash = this.objects.getHashFromIndex(IndexType.lanes, filter);
    if (!hash) return null;
    return (await this.objects.load(new Ref(hash))) as Lane;
  }

  async saveLane(laneObject: Lane) {
    this.objects.add(laneObject);
    await this.objects.persist();
  }

  getCurrentLaneName(): string {
    return this.scopeJson.lanes.current;
  }

  async getCurrentLaneObject(): Promise<Lane | null> {
    return this.loadLane(LocalLaneId.from(this.getCurrentLaneName() || DEFAULT_LANE));
  }

  setCurrentLane(laneName: string): void {
    this.scopeJson.setCurrentLane(laneName);
  }

  getLocalTrackedLaneByRemoteName(remoteLane: string, remoteScope: string): string | null {
    const trackedLane = this.scopeJson.lanes.tracking.find(
      t => t.remoteLane === remoteLane && t.remoteScope === remoteScope
    );
    return trackedLane ? trackedLane.localLane : null;
  }

  getRemoteTrackedDataByLocalLane(localLane: string): TrackLane | undefined {
    return this.scopeJson.lanes.tracking.find(t => t.localLane === localLane);
  }

  trackLane(trackLaneData: TrackLane) {
    this.scopeJson.trackLane(trackLaneData);
  }

  async removeLanes(scope: Scope, lanes: string[], force: boolean) {
    const existingLanes = await this.listLanes();
    const lanesToRemove: Lane[] = lanes.map(laneName => {
      if (laneName === DEFAULT_LANE) throw new GeneralError(`unable to remove the default lane "${DEFAULT_LANE}"`);
      if (laneName === this.getCurrentLaneName())
        throw new GeneralError(`unable to remove the currently used lane "${laneName}"`);
      const existingLane = existingLanes.find(l => l.name === laneName);
      if (!existingLane) throw new GeneralError(`lane ${laneName} was not found in scope`);
      return existingLane;
    });
    if (!force) {
      await Promise.all(
        lanesToRemove.map(async laneObj => {
          const isFullyMerged = await laneObj.isFullyMerged(scope);
          if (!isFullyMerged) {
            throw new GeneralError(
              `unable to remove ${laneObj.name} lane, it is not fully merged. to disregard this error, please use --force flag`
            );
          }
        })
      );
    }
    this.objects.removeManyObjects(lanesToRemove.map(l => l.hash()));
    this.objects.persist();
  }
}