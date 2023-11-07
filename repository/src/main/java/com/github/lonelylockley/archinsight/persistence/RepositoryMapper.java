package com.github.lonelylockley.archinsight.persistence;

import com.github.lonelylockley.archinsight.model.remote.repository.RepostioryInfo;
import com.github.lonelylockley.archinsight.model.remote.repository.RepositoryNode;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.UUID;

@Mapper()
public interface RepositoryMapper {

    @Select("select * from public.repository where id = #{repositoryId}")
    public RepostioryInfo getRepositoryById(UUID repositoryId);

    @Select("select owner_id from public.repository where id = #{repositoryId}")
    public UUID getRepositoryOwnerId(UUID repositoryId);

    @Select("select * from public.repository where owner_id = #{ownerId}")
    public List<RepostioryInfo> listByOwnerId(UUID ownerId);

    @Insert("insert into public.repository (id, owner_id, name) values (#{id}, #{ownerId}, #{name})")
    public void createRepository(RepostioryInfo data);

    @Update("update public.repository set structure = #{root} where id = #{repositoryId}")
    public void setRepositoryStructure(UUID repositoryId, RepositoryNode root);

    @Select("select structure from public.repository where id = #{repositoryId}")
    public RepositoryNode getRepositoryStructure(UUID repositoryId);

    @Delete("delete from public.repository where id = #{id}")
    public void deleteRepository(UUID id);

}
