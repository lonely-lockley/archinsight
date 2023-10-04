package com.github.lonelylockley.archinsight.persistence;

import com.github.lonelylockley.archinsight.model.remote.repository.FileData;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.UUID;

@Mapper()
public interface FileMapper {

    @Insert("insert into public.file (id, owner_id, repository_id, file_name, content) values (#{data.id}, #{data.ownerId}, #{data.repositoryId}, #{data.fileName}, #{data.content})")
    public void createFile(FileData data);

    @Select("select * from public.file where id = #{fileId}")
    public FileData openFile(UUID fileId);

    @Select("<script>select * from public.file where id in <foreach item='item' index='index' collection='ids' open='(' separator=',' close=')'>#{item}</foreach></script>")
    public List<FileData> openFiles(List<UUID> ids);

    @Update("update public.file set content = #{content} where id = #{fileId}")
    public void saveFile(UUID fileId, String content);

    @Delete("delete from public.file where id = #{fileId}")
    public void deleteFile(UUID fileId);

    @Delete("<script>delete from public.file where id in <foreach item='item' index='index' collection='ids' open='(' separator=',' close=')'>#{item}</foreach></script>")
    public void deleteFiles(List<UUID> ids);

    @Update("update pubic.file set file_name = #{filename} where id = #{fileId}")
    public void renameFile(UUID fileID, String filename);

    @Select("select owner_id from public.file where id = #{fileId}")
    public UUID getFileOwnerById(UUID fileId);

}
