package com.github.lonelylockley.archinsight.persistence;

import com.github.lonelylockley.archinsight.model.Userdata;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.UUID;

@Mapper()
public interface RepositoryMapper {

    @Select("select * from public.userdata where id = #{id}")
    public Userdata getById(UUID id);

    @Select("select * from public.userdata where email = #{email}")
    public Userdata getByEmail(String email);

    @Insert("insert into userdata (id, avatar, display_name, email, email_verified, first_name, last_name, origin_id, \"source\", \"locale\") " +
            "values (#{id}, #{avatar}, #{displayName}, #{email}, #{emailVerified}, #{firstName}, #{lastName}, #{originId}, #{source}, #{locale})")
    public void createUserdata(Userdata data);

    @Select("select id from public.userdata where email = #{email}")
    public UUID getIdByEmail(String email);

}
